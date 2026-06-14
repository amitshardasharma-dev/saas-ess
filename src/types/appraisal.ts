export type AppraisalSectionType = 'rating_scale' | 'text' | 'goals' | 'competency'
export type AppraisalCycleStatus = 'Draft' | 'Active' | 'Closed'
export type AppraisalStatus = 'Pending Self' | 'Pending Manager' | 'Pending Review Meeting' | 'Completed'

export interface AppraisalSection {
  id: string; name: string; type: AppraisalSectionType; weight: number
  rating_labels?: string[]; fields?: Array<{ name: string; type: string }>
}

export interface AppraisalTemplate {
  id: string; company_id: string; name: string; description: string | null
  sections: AppraisalSection[]; is_default: boolean
  created_at: string; updated_at: string
}

export interface AppraisalCycle {
  id: string; company_id: string; template_id: string; template_name?: string
  name: string; start_date: string; end_date: string
  self_assessment_deadline: string; manager_review_deadline: string
  status: AppraisalCycleStatus
  created_at: string; total_appraisals?: number; completed_count?: number
}

export interface Appraisal {
  id: string; cycle_id: string; employee_id: string; manager_id: string
  status: AppraisalStatus; overall_rating: number | null; final_comments: string | null
  created_at: string; updated_at: string
  employee_name?: string; employee_no?: string; manager_name?: string
  cycle_name?: string; template?: AppraisalTemplate
}

export interface AppraisalResponse {
  id: string; appraisal_id: string; section_id: string
  respondent_type: 'self' | 'manager'
  ratings: Record<string, number>; comments: string | null
}

export interface Goal {
  id: string; employee_id: string; cycle_id: string | null
  title: string; description: string | null; target_metric: string | null
  current_progress: number; status: 'Not Started' | 'In Progress' | 'Completed' | 'Deferred'
  weight: number; created_at: string; updated_at: string
}
