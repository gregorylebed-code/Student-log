export interface Note {
  id: string;
  content: string;
  student_name: string;
  user_id: string;
  tags: string[];
  deadline: string | null;
  image_url: string | null;
  is_pinned: boolean;
  is_checklist: boolean;
  checklist_data: number[];
  created_at: string;
  is_parent_communication?: boolean;
  parent_communication_type?: 'ParentSquare' | 'Phone' | 'Email' | 'Meeting' | null;
}

export interface Student {
  id: string;
  name: string;
  class_period: 'AM' | 'PM';
  user_id: string;
  created_at: string;
}
