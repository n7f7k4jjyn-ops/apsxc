"""Read-only XLSX/ZIP extraction. Requires openpyxl; never rewrites sources.

Usage: python extract.py INPUT_DIRECTORY OUTPUT_DIRECTORY
Personal data belongs in the output directory, outside the git checkout.
"""
import csv
import datetime as dt
import hashlib
import io
import json
import re
import sys
import unicodedata
import zipfile
from collections import defaultdict
from decimal import Decimal, ROUND_HALF_UP
from pathlib import Path

import openpyxl


def norm(v):
    return ' '.join(''.join(c for c in unicodedata.normalize('NFD', str(v or '')) if not unicodedata.combining(c)).lower().split())


def text(v):
    return str(int(v)) if isinstance(v, float) and v.is_integer() else str(v or '').strip()


def date(v):
    return v.date().isoformat() if isinstance(v, dt.datetime) else v.isoformat() if isinstance(v, dt.date) else ''


def cents(v):
    if v is None or v == '':
        return 0
    if isinstance(v, bool) or not isinstance(v, (int, float)):
        raise ValueError('Valor não numérico')
    return int((Decimal(str(v)) * 100).quantize(Decimal('1'), rounding=ROUND_HALF_UP))


def ident(prefix, key):
    return prefix + hashlib.sha256(key.encode()).hexdigest()[:24]


def extract(source, destination):
    out = Path(destination)
    out.mkdir(parents=True, exist_ok=True)
    books, raw, issues = [], [], []
    for p in sorted(Path(source).glob('*')):
        if p.suffix.lower() == '.xlsx':
            books.append((p.name, p.read_bytes()))
        elif p.suffix.lower() == '.zip':
            with zipfile.ZipFile(p) as z:
                books.extend((p.name + '/' + n, z.read(n)) for n in z.namelist() if n.endswith('.xlsx'))
    people, engagements, payments, staff = {}, {}, {}, {}
    duplicate_rows = 0
    errors = defaultdict(int)

    def person(name, fields, origin):
        key = norm(name)
        if not key or key.startswith('#'):
            return
        row = people.setdefault(key, {'id': ident('sheet-dj-', key), 'name': text(name), 'phone': '', 'pixKey': '', 'beneficiary': '', 'fullName': '', 'cpf': '', 'rg': '', 'birthDate': '', 'sources': []})
        row['sources'].append(origin)
        for field, value in fields.items():
            value = text(value)
            if not value or value.startswith('#'):
                continue
            if row.get(field) and norm(row[field]) != norm(value):
                issues.append({'kind': 'person-conflict', 'name': row['name'], 'field': field, 'values': [row[field], value], 'source': origin})
            else:
                row[field] = value

    for filename, content in books:
        w = openpyxl.load_workbook(io.BytesIO(content), read_only=True, data_only=True)
        for s in w:
            rows = list(s.values)
            for index, row in enumerate(rows, 1):
                if not any(v is not None for v in row):
                    continue
                origin = {'file': filename, 'sheet': s.title, 'row': index}
                raw.append({**origin, 'values': [v.isoformat() if isinstance(v, (dt.datetime, dt.date, dt.time)) else v for v in row]})
                for v in row:
                    if isinstance(v, str) and v.startswith(('#REF!', '#VALUE!', '#N/A', '#DIV/0!')):
                        errors[s.title] += 1
            if norm(s.title) == 'dados':
                for index, r in enumerate(rows[4:], 5):
                    if r[0]:
                        vals = list(r) + [None] * 8
                        person(vals[0], dict(zip(['pixKey', 'beneficiary', 'phone', 'fullName', 'cpf', 'rg', 'birthDate'], [date(v) if isinstance(v, dt.datetime) else v for v in vals[1:8]])), {'file': filename, 'sheet': s.title, 'row': index})
            if norm(s.title) in ['calendario', '2026', 'agenda 2026']:
                header_index = next((i for i, r in enumerate(rows) if 'DATA APR.' in r and 'ARTISTA' in r), None)
                if header_index is None:
                    continue
                header = [norm(x) for x in rows[header_index]]
                for index, r in enumerate(rows[header_index+1:], header_index+2):
                    obj = dict(zip(header, r))
                    name, day = text(obj.get('artista')), date(obj.get('data apr.'))
                    if not name or not day:
                        continue
                    origin = {'file': filename, 'sheet': s.title, 'row': index}
                    person(name, {}, origin)
                    event, track = text(obj.get('evento')), text(obj.get('pista')).upper()
                    key = '|'.join([day, norm(event), track, norm(name)])
                    row = engagements.setdefault(key, {'id': ident('sheet-gig-', key), 'personId': people[norm(name)]['id'], 'name': name, 'date': day, 'event': event, 'track': track, 'order': index, 'time': '', 'sources': [], 'amountCandidates': [], 'paymentCandidates': []})
                    if row['sources']:
                        duplicate_rows += 1
                    row['sources'].append(origin)
                    if 'cache' in obj:
                        try:
                            components = {k: cents(obj.get(k)) for k in ['cache', 'transporte', 'alimentacao', 'outros', 'pass.', 'hot.']}
                            total = cents(obj.get('total final')) if obj.get('total final') is not None else sum(components.values())
                            if total > 0:
                                candidate = {'amountCents': total, 'components': components}
                                if candidate not in row['amountCandidates']:
                                    row['amountCandidates'].append(candidate)
                                if sum(components.values()) != total:
                                    issues.append({'kind': 'amount-components', 'id': row['id'], 'source': origin})
                        except ValueError:
                            issues.append({'kind': 'invalid-amount', 'id': row['id'], 'source': origin})
                    if norm(s.title) == '2026':
                        candidate = {'status': text(obj.get('status')), 'paidDate': date(obj.get('data pgto.')), 'notes': text(obj.get('obs.'))}
                        if candidate not in row['paymentCandidates']:
                            row['paymentCandidates'].append(candidate)
            if norm(s.title) in ['a pagar', 'pagos']:
                for index, r in enumerate(rows[2:], 3):
                    vals = list(r) + [None] * 10
                    if not vals[0] or not date(vals[1]):
                        continue
                    origin = {'file': filename, 'sheet': s.title, 'row': index}
                    person(vals[0], {'pixKey': vals[7], 'beneficiary': vals[8], 'phone': vals[9]} if norm(s.title) == 'a pagar' else {}, origin)
                    key = '|'.join([date(vals[1]), norm(vals[0])])
                    try:
                        candidate = {'amountCents': cents(vals[6]), 'status': 'Pago' if norm(s.title) == 'pagos' else 'Pendente', 'paidDate': date(vals[7]) if norm(s.title) == 'pagos' else '', 'source': origin}
                        payments.setdefault(key, []).append(candidate)
                    except ValueError:
                        issues.append({'kind': 'invalid-payment', 'source': origin})
            if rows and rows[0] and norm(rows[0][0]) == 'carimbo de data/hora':
                for index, r in enumerate(rows[1:], 2):
                    if len(r) < 5 or not r[1]:
                        continue
                    phone = re.sub(r'\D', '', text(r[2]))
                    if phone.startswith('55') and len(phone) > 11:
                        phone = phone[2:]
                    key = norm(r[1]) + '|' + phone
                    origin = {'file': filename, 'sheet': s.title, 'row': index}
                    record = {'name': text(r[1]), 'whatsapp': phone, 'roles': [x for x in ['Caixa', 'Bar', 'Limpeza', 'Segurança', 'Cozinha', 'Bombeiro'] if norm(x) in norm(r[4])], 'availability': [x for x in ['Quinta-feira', 'Sexta-feira', 'Sábado', 'Domingo'] if norm(x) in norm(r[3])], 'createdAt': r[0].isoformat() if isinstance(r[0], dt.datetime) else '', 'experience': 'Disponibilidade histórica: ' + text(r[3]), 'source': origin}
                    old = staff.get(key)
                    if old:
                        duplicate_rows += 1
                    if not old or record['createdAt'] > old['createdAt']:
                        staff[key] = record
            if norm(s.title) == 'reembolsos anderson':
                for index, r in enumerate(rows[2:], 3):
                    if any(v is not None for v in r):
                        issues.append({'kind': 'reimbursement-review', 'source': {'file': filename, 'sheet': s.title, 'row': index}, 'reason': 'Conciliar despesa original e pagamento por terceiro antes de lançar reembolso; evitar despesa em dobro.'})
    # Older monthly schedules and visual weekly agendas use a different layout.
    # Enrich existing gigs by date/track/person; only create a gig when absent.
    for filename, content in books:
        w = openpyxl.load_workbook(io.BytesIO(content), read_only=True, data_only=True)
        for s in w:
            rows = list(s.values)
            monthly = bool(rows and rows[0] and norm(rows[0][0]) == 'artista' and 'DATA APR.' in rows[0])
            track = ''
            date_columns = {}
            for index, r in enumerate(rows, 1):
                origin = {'file': filename, 'sheet': s.title, 'row': index}
                if monthly:
                    if r and norm(r[0]) in ['land', 'sky']:
                        track = text(r[0]).upper()
                    if len(r) < 7 or not r[0] or not date(r[1]):
                        continue
                    name, day, event = text(r[0]), date(r[1]), ''
                    matches = [g for g in engagements.values() if g['date'] == day and norm(g['name']) == norm(name) and g['track'] == track]
                    if len(matches) > 1:
                        issues.append({'kind': 'ambiguous-old-schedule', 'source': origin})
                        continue
                    person(name, {}, origin)
                    key = '|'.join([day, '', track, norm(name)])
                    g = matches[0] if matches else engagements.setdefault(key, {'id': ident('sheet-gig-', key), 'personId': people[norm(name)]['id'], 'name': name, 'date': day, 'event': '', 'track': track, 'order': index, 'time': '', 'sources': [], 'amountCandidates': [], 'paymentCandidates': []})
                    if g['sources']:
                        duplicate_rows += 1
                    g['sources'].append(origin)
                    try:
                        parts = dict(zip(['cache', 'transporte', 'alimentacao', 'outros'], [cents(v) for v in r[2:6]]))
                        candidate = {'amountCents': cents(r[6]), 'components': parts}
                        if candidate['amountCents'] > 0 and candidate not in g['amountCandidates']:
                            g['amountCandidates'].append(candidate)
                    except ValueError:
                        issues.append({'kind': 'invalid-amount', 'source': origin})
                elif norm(s.title) not in ['dados', 'calendario', '2026', 'agenda 2026', 'pagos', 'a pagar', 'aereobus', 'hotel', 'acordo djs', 'resumos', 'reembolsos anderson']:
                    for col, v in enumerate(r):
                        if isinstance(v, dt.datetime):
                            date_columns[col] = {'date': date(v), 'event': '', 'track': ''}
                    for col, context in date_columns.items():
                        if col >= len(r):
                            continue
                        v = r[col]
                        if isinstance(v, str) and 'pista ' in norm(v):
                            context['track'] = 'SKY' if 'sky' in norm(v) else 'LAND' if 'land' in norm(v) else ''
                        elif isinstance(v, str) and v.strip() and not re.search(r'\d', v) and not context['track']:
                            context['event'] = v.strip()
                        is_time = isinstance(v, dt.time) or (isinstance(v, str) and bool(re.match(r'^\d{1,2}[:hH]', v.strip())))
                        if not is_time or col+1 >= len(r) or not isinstance(r[col+1], str) or not r[col+1].strip() or not context['track']:
                            continue
                        name, day, track = r[col+1].strip(), context['date'], context['track']
                        person(name, {}, origin)
                        matches = [g for g in engagements.values() if g['date'] == day and norm(g['name']) == norm(name) and g['track'] == track]
                        if len(matches) > 1:
                            issues.append({'kind': 'ambiguous-lineup', 'source': origin})
                            continue
                        key = '|'.join([day, norm(context['event']), track, norm(name)])
                        g = matches[0] if matches else engagements.setdefault(key, {'id': ident('sheet-gig-', key), 'personId': people[norm(name)]['id'], 'name': name, 'date': day, 'event': context['event'], 'track': track, 'order': index, 'time': '', 'sources': [], 'amountCandidates': [], 'paymentCandidates': []})
                        time = v.strftime('%H:%M') if isinstance(v, dt.time) else v.strip()
                        if g['time'] and g['time'] != time:
                            issues.append({'kind': 'lineup-time-conflict', 'id': g['id'], 'values': [g['time'], time], 'source': origin})
                        elif not g['time']:
                            g['time'] = time
                        g['sources'].append(origin)
    grouped = defaultdict(list)
    for row in engagements.values():
        grouped[row['date'] + '|' + norm(row['name'])].append(row)
    finance = []
    for row in engagements.values():
        candidates = row.pop('amountCandidates')
        main_payments = row.pop('paymentCandidates')
        alternatives = payments.get(row['date'] + '|' + norm(row['name']), [])
        amounts = set(c['amountCents'] for c in candidates)
        reasons = []
        if any(issue.get('id') == row['id'] and issue['kind'] in ['amount-components', 'invalid-amount'] for issue in issues):
            reasons.append('Total e componentes da despesa precisam de conciliação')
        if any(issue['kind'] == 'person-conflict' and norm(issue['name']) == norm(row['name']) for issue in issues):
            reasons.append('Cadastro do beneficiário tem dados divergentes')
        if len(amounts) != 1:
            reasons.append('Valor ausente ou divergente entre fontes')
        if len(grouped[row['date'] + '|' + norm(row['name'])]) != 1:
            reasons.append('Mais de uma contratação para artista/data; conciliar pagamentos')
        statuses = {(norm(c['status']), c['paidDate']) for c in main_payments}
        for c in alternatives:
            statuses.add((norm(c['status']), c['paidDate']))
            if amounts and c['amountCents'] not in amounts:
                reasons.append('Valor diverge da aba de pagamento')
        paid = {day for status, day in statuses if status == 'pago' and day}
        pending = any(status in ['pendente', 'a pagar', 'em aberto'] for status, day in statuses)
        if len(paid) > 1 or (paid and pending):
            reasons.append('Situação ou data de pagamento divergente')
        if not statuses:
            reasons.append('Sem situação financeira: status do evento não comprova pagamento')
        elif not paid and not pending:
            reasons.append('Situação financeira não reconhecida ou pagamento sem data')
        row['amountCents'] = next(iter(amounts)) if len(amounts) == 1 else None
        row['financialReview'] = list(dict.fromkeys(reasons))
        row['paymentSources'] = alternatives
        if reasons:
            issues.append({'kind': 'engagement-review', 'id': row['id'], 'name': row['name'], 'date': row['date'], 'reasons': row['financialReview'], 'amountCandidates': candidates, 'paymentCandidates': main_payments})
        else:
            finance.append({'externalId': row['id'], 'personId': row['personId'], 'eventKey': row['date'] + '|' + norm(row['event']), 'type': 'payable', 'category': 'dj', 'description': 'Cachê e despesas — ' + row['event'] + ' / ' + row['track'], 'amountCents': row['amountCents'], 'dueDate': row['date'], 'status': 'settled' if paid else 'pending', 'settledDate': next(iter(paid)) if paid else '', 'paymentMethod': 'other' if paid else '', 'notes': 'Importação histórica. Vencimento não informado: data da apresentação usada como referência. Meio de pagamento não informado.'})
    for sheet, count in errors.items():
        issues.append({'kind': 'excel-errors', 'sheet': sheet, 'count': count})
    for key, entries in payments.items():
        if key not in grouped:
            issues.append({'kind': 'payment-without-engagement', 'key': key, 'records': entries})
    line_groups = defaultdict(list)
    for gig in engagements.values():
        line_groups[(gig['date'], norm(gig['event']), gig['track'])].append(gig)
    for gigs in line_groups.values():
        for order, gig in enumerate(sorted(gigs, key=lambda g: g['order']), 1):
            gig['order'] = order
    team_ready = []
    for t in staff.values():
        if not re.fullmatch(r'\d{10,11}', t['whatsapp']) or not t['roles'] or not t['availability']:
            issues.append({'kind': 'team-review', 'record': t, 'reason': 'Telefone, função ou disponibilidade inválida; não completar DDD por suposição.'})
        else:
            team_ready.append(t)
    for p in people.values():
        p['conflicts'] = sorted({issue['field'] for issue in issues if issue['kind'] == 'person-conflict' and norm(issue['name']) == norm(p['name'])})
    bundle = {'schemaVersion': 1, 'people': list(people.values()), 'team': team_ready, 'engagements': list(engagements.values()), 'finance': finance}
    summary = {'files': len(books), 'sourceRows': len(raw), 'people': len(people), 'team': len(staff), 'teamReady': len(team_ready), 'engagements': len(engagements), 'events': len({(r['date'], norm(r['event'])) for r in engagements.values()}), 'financeReady': len(finance), 'engagementsReview': sum(bool(r['financialReview']) for r in engagements.values()), 'duplicateEngagementOrTeamRows': duplicate_rows, 'issues': len(issues), 'influencerRecords': 0}
    for name, data in [('importacao.json', bundle), ('pendencias.json', issues), ('fontes-originais.json', raw), ('resumo.json', summary)]:
        (out / name).write_text(json.dumps(data, ensure_ascii=False, indent=2, default=str), encoding='utf-8')
    columns = ['date', 'event', 'track', 'order', 'time', 'name', 'amountCents', 'financialReview']
    with (out / 'line-ups.csv').open('w', encoding='utf-8-sig', newline='') as f:
        writer = csv.writer(f, delimiter=';')
        writer.writerow(columns)
        for r in sorted(engagements.values(), key=lambda x: (x['date'], x['event'], x['track'], x['order'])):
            writer.writerow([("'" + str(r[k])) if str(r[k]).startswith(('=', '+', '-', '@')) else r[k] for k in columns])
    print(json.dumps(summary, ensure_ascii=False))


if __name__ == '__main__':
    extract(*sys.argv[1:])
