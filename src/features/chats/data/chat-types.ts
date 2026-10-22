export type Convo = {
  sender: string
  message: string
  timestamp: string
}

export type ChatUser = {
  id: string
  profile: string
  username: string
  fullName: string
  title: string
  messages: Convo[]
}
