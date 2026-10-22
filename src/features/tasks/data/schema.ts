import { z } from 'zod'

// We're keeping a simple non-relational schema here.
// IRL, you will have a schema for your data models.
export const taskSchema = z.object({
  id: z.string(),
  title: z.string(),
  description: z.string().optional(),
  status: z.string(),
  label: z.string(),
  priority: z.string(),
  assignee: z.string().optional(),
  assigneeName: z.string().optional(),
  dueDate: z.string().optional(),
  createdAt: z.string().optional(),
  updatedAt: z.string().optional(),
})

export type Task = z.infer<typeof taskSchema>
