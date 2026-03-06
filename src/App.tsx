import React, { useState, useEffect, useRef } from 'react';
import { supabase, isConfigured } from './lib/supabase';
import { categorizeNote, smartSearch, summarizeNotes, semanticSearch, parseVoiceLog, draftParentSquareMessage } from './lib/gemini';
import { Note, Student } from './types';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import imageCompression from 'browser-image-compression';
import { 
  Search, Plus, LogOut, Tag, Calendar, Loader2, MessageSquare, Shield, User, Lock, 
  ChevronRight, Mic, MicOff, Pin, Trash2, Undo, Download, Filter, AlertCircle, 
  ExternalLink, CheckSquare, Square, Edit2, Copy, Sparkles, X, Clock, RotateCcw, 
  Users, GraduationCap, ImageIcon, Settings, Phone, Mail, MessageCircle, TrendingUp, 
  ChevronDown, ChevronUp, LayoutGrid, Activity 
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { motion, AnimatePresence } from 'framer-motion';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

function toTitleCase(str: string) {
  return str.toLowerCase().split(' ').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ');
}

function getLevenshteinDistance(a: string, b: string): number {
  const matrix = Array.from({ length: a.length + 1 }, () => 
    Array.from({ length: b.length + 1 }, (_, i) => i)
  );
  for (let i = 0; i <= a.length; i++) matrix[i][0] = i;

  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1,
        matrix[i][j - 1] + 1,
        matrix[i - 1][j - 1] + cost
      );
    }
  }
  return matrix[a.length][b.length];
}

function findBestMatch(name: string, existingNames: string[]): string {
  const normalized = name.trim().toLowerCase();
  if (!normalized) return name;

  let bestMatch = name;
  let minDistance = 3; // Threshold for "close enough"

  for (const existing of existingNames) {
    const existingNormalized = existing.toLowerCase();
    if (normalized === existingNormalized) return existing;

    const distance = getLevenshteinDistance(normalized, existingNormalized);
    if (distance < minDistance) {
      minDistance = distance;
      bestMatch = existing;
    }
  }
  
  return bestMatch;
}

// Speech Recognition Types
declare global {
  interface Window {
    SpeechRecognition: any;
    webkitSpeechRecognition: any;
  }
}

const AVAILABLE_TAGS = ['Behavior', 'Academic', 'Social', 'Attendance', 'Health', 'Other'];

const INCIDENT_TEMPLATES = [
  { label: 'Disruption', text: 'disruption' },
  { label: 'Peer Conflict', text: 'peer conflict' },
  { label: 'Distracted', text: 'distracted' },
  { label: 'Missing HW', text: 'missing hw' },
  { label: 'Unprepared', text: 'unprepared' },
  { label: 'Participation', text: 'participation' },
  { label: 'Kindness', text: 'kindness' },
  { label: 'Persistence', text: 'persistence' }
];

export default function App() {
  const [session, setSession] = useState<any>(null);
  const [notes, setNotes] = useState<Note[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [loading, setLoading] = useState(true);
  const [newNote, setNewNote] = useState('');
  const [newStudentName, setNewStudentName] = useState('');
  const [newNoteDeadline, setNewNoteDeadline] = useState<string>('');
  const [isParentComm, setIsParentComm] = useState(false);
  const [parentCommType, setParentCommType] = useState<'ParentSquare' | 'Phone' | 'Email' | 'Meeting' | null>(null);
  
  const [isSaving, setIsSaving] = useState(false);
  const [isParsingVoice, setIsParsingVoice] = useState(false);
  const [isChecklistMode, setIsChecklistMode] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResult, setSearchResult] = useState<string | null>(null);
  const [isSearching, setIsSearching] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [isVoiceLogging, setIsVoiceLogging] = useState(false);
  const [isSearchListening, setIsSearchListening] = useState(false);
  const [editingNoteId, setEditingNoteId] = useState<string | null>(null);
  const [editingContent, setEditingContent] = useState('');
  const [editingStudentName, setEditingStudentName] = useState('');
  const [editingDeadline, setEditingDeadline] = useState<string>('');
  const [editingTagsNoteId, setEditingTagsNoteId] = useState<string | null>(null);
  const [editingTags, setEditingTags] = useState<string[]>([]);
  const [isUpdating, setIsUpdating] = useState(false);
  const [selectedImage, setSelectedImage] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [isUploadingImage, setIsUploadingImage] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [lastDeletedNote, setLastDeletedNote] = useState<Note | null>(null);
  const [showUndoToast, setShowUndoToast] = useState(false);
  const [filterTag, setFilterTag] = useState<string>('All');
  const [selectedStudent, setSelectedStudent] = useState<string>('All');
  const [isSummarizing, setIsSummarizing] = useState(false);
  const [summaryResult, setSummaryResult] = useState<string | null>(null);
  const [trendsSummary, setTrendsSummary] = useState<string | null>(null);
  const [selectedNoteIds, setSelectedNoteIds] = useState<string[]>([]);
  const [isDeletingBulk, setIsDeletingBulk] = useState(false);
  const [isMergingBulk, setIsMergingBulk] = useState(false);
  const [showBulkConfirm, setShowBulkConfirm] = useState(false);
  const [semanticMatchIds, setSemanticMatchIds] = useState<string[]>([]);
  const [activeSearchQuery, setActiveSearchQuery] = useState('');
  const [showExportModal, setShowExportModal] = useState(false);
  const [exportStartDate, setExportStartDate] = useState('');
  const [exportEndDate, setExportEndDate] = useState('');
  const [exportStudent, setExportStudent] = useState('All');
  const [nameSuggestion, setNameSuggestion] = useState<string | null>(null);
  const [isSuggestionRejected, setIsSuggestionRejected] = useState(false);

  const [showRosterModal, setShowRosterModal] = useState(false);
  const [rosterInput, setRosterInput] = useState('');
  const [rosterPeriod, setRosterPeriod] = useState<'AM' | 'PM'>('AM');
  const [isSavingRoster, setIsSavingRoster] = useState(false);
  const [trendsTimeframe, setTrendsTimeframe] = useState<'30' | '60' | '90' | 'Year'>('30');
  const [showTrendsModal, setShowTrendsModal] = useState(false);
  const [isAmExpanded, setIsAmExpanded] = useState(true);
  const [isPmExpanded, setIsPmExpanded] = useState(true);
  const [personalReflection, setPersonalReflection] = useState('');
  const [isSavingReflection, setIsSavingReflection] = useState(false);
  const [isDraftingParentSquare, setIsDraftingParentSquare] = useState<string | null>(null);
  const [parentSquareDraft, setParentSquareDraft] = useState<string | null>(null);
  const [editingStudent, setEditingStudent] = useState<Student | null>(null);
  const [isUpdatingStudent, setIsUpdatingStudent] = useState(false);
  const [isDeletingStudent, setIsDeletingStudent] = useState<string | null>(null);

  // Auth State
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [authMode, setAuthMode] = useState<'login' | 'signup'>('login');
  const [authError, setAuthError] = useState<string | null>(null);
  const [authSuccess, setAuthSuccess] = useState<string | null>(null);

  useEffect(() => {
    if (!isConfigured) {
      setLoading(false);
      return;
    }

    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      if (session) {
        fetchNotes(session.user.id);
        fetchStudents(session.user.id);
        fetchPersonalReflection(session.user.id);
      }
      setLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      if (session) {
        fetchNotes(session.user.id);
        fetchStudents(session.user.id);
        fetchPersonalReflection(session.user.id);
      }
      else {
        setNotes([]);
        setStudents([]);
      }
    });

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  const toggleListening = () => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      alert("Your browser doesn't support voice recognition. Try Chrome or Safari!");
      return;
    }
    if (isListening) {
      setIsListening(false);
      return;
    }
    const recognition = new SpeechRecognition();
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.lang = 'en-US';
    recognition.onstart = () => setIsListening(true);
    recognition.onend = () => setIsListening(false);
    recognition.onresult = (event: any) => {
      const transcript = event.results[0][0].transcript;
      setNewNote(prev => prev ? `${prev} ${transcript}` : transcript);
    };
    recognition.start();
  };

  const toggleSearchListening = () => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      alert("Your browser doesn't support voice recognition. Try Chrome or Safari!");
      return;
    }
    if (isSearchListening) {
      setIsSearchListening(false);
      return;
    }
    const recognition = new SpeechRecognition();
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.lang = 'en-US';
    recognition.onstart = () => setIsSearchListening(true);
    recognition.onend = () => setIsSearchListening(false);
    recognition.onresult = (event: any) => {
      const transcript = event.results[0][0].transcript;
      setSearchQuery(prev => prev ? `${prev} ${transcript}` : transcript);
    };
    recognition.start();
  };

  const toggleVoiceLog = () => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      alert("Your browser doesn't support voice recognition. Try Chrome or Safari!");
      return;
    }
    if (isVoiceLogging) {
      setIsVoiceLogging(false);
      return;
    }
    const recognition = new SpeechRecognition();
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.lang = 'en-US';
    recognition.onstart = () => setIsVoiceLogging(true);
    recognition.onend = () => setIsVoiceLogging(false);
    recognition.onresult = async (event: any) => {
      const transcript = event.results[0][0].transcript;
      setIsParsingVoice(true);
      try {
        const result = await parseVoiceLog(transcript);
        setNewStudentName(result?.student_name || 'Unknown');
        setNewNote(result?.content || transcript);
      } catch (err) {
        console.error('Error parsing voice log:', err);
        setNewNote(transcript);
        setNewStudentName('Unknown');
      } finally {
        setIsParsingVoice(false);
      }
    };
    recognition.start();
  };

  async function fetchNotes(userId: string) {
    if (!isConfigured) return;
    const { data, error } = await supabase
      .from('student_notes')
      .select('*')
      .eq('user_id', userId)
      .order('is_pinned', { ascending: false })
      .order('created_at', { ascending: false });
    if (error) console.error('Error fetching notes:', error);
    else setNotes(data || []);
  }

  async function fetchStudents(userId: string) {
    if (!isConfigured) return;
    const { data, error } = await supabase
      .from('students')
      .select('*')
      .eq('user_id', userId)
      .order('name', { ascending: true });
    if (error) console.error('Error fetching students:', error);
    else setStudents(data || []);
  }

  async function fetchPersonalReflection(userId: string) {
    if (!isConfigured) return;
    const { data, error } = await supabase
      .from('personal_reflections')
      .select('content')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(1);
    
    if (error) {
      // If table doesn't exist, we'll just use localStorage as fallback
      const saved = localStorage.getItem(`reflection_${userId}`);
      if (saved) setPersonalReflection(saved);
      return;
    }
    
    if (data && data.length > 0) {
      setPersonalReflection(data[0].content);
    }
  }

  async function handleSaveReflection() {
    if (!session || !isConfigured) return;
    setIsSavingReflection(true);
    try {
      const { error } = await supabase.from('personal_reflections').insert([{
        content: personalReflection,
        user_id: session.user.id
      }]);
      
      if (error) {
        // Fallback to localStorage if table doesn't exist
        localStorage.setItem(`reflection_${session.user.id}`, personalReflection);
      }
    } finally {
      setIsSavingReflection(false);
    }
  }

  async function handleDraftParentSquare(note: Note) {
    setIsDraftingParentSquare(note.id);
    try {
      const draft = await draftParentSquareMessage(note.content, note.student_name);
      setParentSquareDraft(draft || 'Failed to generate draft.');
    } catch (err) {
      console.error('Drafting failed:', err);
      setParentSquareDraft('Error generating draft.');
    } finally {
      setIsDraftingParentSquare(null);
    }
  }

  async function handleUpdateStudent() {
    if (!editingStudent || !session || !isConfigured) return;
    setIsUpdatingStudent(true);
    try {
      const { error } = await supabase
        .from('students')
        .update({ name: toTitleCase(editingStudent.name), class_period: editingStudent.class_period })
        .eq('id', editingStudent.id);
      
      if (error) throw error;
      
      await fetchStudents(session.user.id);
      setEditingStudent(null);
    } catch (err: any) {
      alert(`Failed to update student: ${err.message}`);
    } finally {
      setIsUpdatingStudent(false);
    }
  }

  async function handleDeleteStudent(id: string) {
    if (!session || !isConfigured) return;
    setIsDeletingStudent(id);
    try {
      const { error } = await supabase
        .from('students')
        .delete()
        .eq('id', id);
      
      if (error) throw error;
      
      await fetchStudents(session.user.id);
    } catch (err: any) {
      alert(`Failed to delete student: ${err.message}`);
    } finally {
      setIsDeletingStudent(null);
    }
  }

  function getInvisibilityAlert(studentName: string) {
    const studentNotes = notes.filter(n => toTitleCase(n.student_name) === toTitleCase(studentName));
    const socialNotes = studentNotes.filter(n => n.tags.includes('Social') || n.tags.includes('Kindness'));
    
    if (socialNotes.length === 0) return true;
    
    const latestSocialNote = new Date(socialNotes[0].created_at);
    const tenDaysAgo = new Date();
    tenDaysAgo.setDate(tenDaysAgo.getDate() - 10);
    
    return latestSocialNote < tenDaysAgo;
  }

  async function handleAuth(e: React.FormEvent) {
    e.preventDefault();
    if (!isConfigured) return;
    setAuthError(null);
    setAuthSuccess(null);
    setLoading(true);
    try {
      if (authMode === 'login') {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
      } else {
        const { data, error } = await supabase.auth.signUp({ email, password });
        if (error) throw error;
        if (data.user && !data.session) setAuthSuccess('Signup successful! Please check your email.');
      }
    } catch (err: any) {
      setAuthError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleImageSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const options = { maxSizeMB: 0.2, maxWidthOrHeight: 1200, useWebWorker: true, fileType: 'image/webp' as any };
    try {
      const compressedFile = await imageCompression(file, options);
      setSelectedImage(compressedFile);
      setImagePreview(URL.createObjectURL(compressedFile));
    } catch (error) {
      console.error('Error compressing image:', error);
    }
  }

  async function handleAddNote(e?: React.FormEvent | React.MouseEvent) {
    if (e) e.preventDefault();
    console.log("Attempting to save note...", { newNote, newStudentName, hasSession: !!session, isConfigured });
    
    const noteContent = newNote || '';
    if (!noteContent.trim() && !selectedImage) {
      console.warn("Save aborted: No content or image");
      return;
    }
    if (!session) {
      console.error("Save aborted: No active session");
      alert("You must be logged in to save notes.");
      return;
    }
    if (!isConfigured) {
      console.error("Save aborted: Supabase not configured");
      alert("Supabase configuration is missing. Please check your Secrets.");
      return;
    }
    
    setIsSaving(true);
    try {
      let imageUrl = null;
      if (selectedImage) {
        console.log("Uploading image...");
        const fileName = `${Date.now()}-${Math.random().toString(36).substring(2, 9)}.webp`;
        const filePath = `${session.user.id}/${fileName}`;
        const { error: uploadError } = await supabase.storage.from('note-images').upload(filePath, selectedImage);
        if (uploadError) throw uploadError;
        const { data: { publicUrl } } = supabase.storage.from('note-images').getPublicUrl(filePath);
        imageUrl = publicUrl;
      }

      const currentTime = new Date().toLocaleString();
      console.log("Categorizing note with AI...");
      const aiResult = await categorizeNote(noteContent, currentTime, !!selectedImage);
      
      let finalDeadline = newNoteDeadline || aiResult?.deadline;
      // Sanitize deadline: ensure it's a valid date string or null, never the string "null"
      if (!finalDeadline || finalDeadline === 'null') {
        finalDeadline = null;
      }
      
      console.log("Inserting note into Supabase...");
      const rawName = (newStudentName || 'Unknown').trim();
      let formattedStudentName;

      if (isSuggestionRejected) {
        // If user rejected the suggestion, use their exact input (Title Cased)
        formattedStudentName = toTitleCase(rawName);
      } else {
        // Otherwise, use the smart matching
        const existingStudentNames = Array.from(new Set(notes.map(n => n.student_name))).filter(Boolean) as string[];
        const matchedName = findBestMatch(rawName, existingStudentNames);
        formattedStudentName = toTitleCase(matchedName);
      }
      
      const { data, error } = await supabase.from('student_notes').insert([{ 
        content: noteContent, 
        student_name: formattedStudentName, 
        user_id: session.user.id,
        tags: aiResult?.tags || ['Other'], 
        deadline: finalDeadline, 
        image_url: imageUrl, 
        is_pinned: false,
        is_checklist: isChecklistMode, 
        checklist_data: [],
        is_parent_communication: isParentComm,
        parent_communication_type: isParentComm ? parentCommType : null
      }]).select();
      
      if (error) {
        console.error("Supabase insert error:", error);
        throw error;
      }
      
      if (data) {
        console.log("Note saved successfully!");
        setNotes([data[0], ...notes]);
      }
      
      setNewNote(''); 
      setNewStudentName(''); 
      setNewNoteDeadline(''); 
      setSelectedImage(null); 
      setImagePreview(null); 
      setIsChecklistMode(false);
      setIsSuggestionRejected(false);
      setIsParentComm(false);
      setParentCommType(null);
    } catch (err: any) {
      console.error('Final save error:', err);
      alert(`Save Failed: ${err.message}. Check the browser console for details.`);
    } finally { 
      setIsSaving(false); 
    }
  }

  async function handleSuggestDeadline() {
    if (!newNote.trim()) return;
    setIsSaving(true);
    try {
      const currentTime = new Date().toLocaleString();
      const { deadline } = await categorizeNote(newNote, currentTime, !!selectedImage);
      if (deadline) setNewNoteDeadline(new Date(deadline).toISOString().split('T')[0]);
    } catch (err) { console.error('Error suggesting deadline:', err); }
    finally { setIsSaving(false); }
  }

  async function handleDeleteNote(id: string) {
    if (!isConfigured) return;
    const noteToDelete = notes.find(n => n.id === id);
    if (!noteToDelete) return;
    const { error } = await supabase.from('student_notes').delete().eq('id', id);
    if (!error) {
      setLastDeletedNote(noteToDelete); setShowUndoToast(true);
      setNotes(notes.filter(n => n.id !== id));
      setTimeout(() => setShowUndoToast(false), 6000);
    }
  }

  async function handleUndoDelete() {
    if (!lastDeletedNote || !isConfigured) return;
    const { data, error } = await supabase.from('student_notes').insert([lastDeletedNote]).select();
    if (!error && data) {
      setNotes(prev => [...prev, data[0]].sort((a, b) => (b.is_pinned ? 1 : 0) - (a.is_pinned ? 1 : 0) || new Date(b.created_at).getTime() - new Date(a.created_at).getTime()));
      setShowUndoToast(false); setLastDeletedNote(null);
    }
  }

  async function handleToggleChecklistItem(note: Note, index: number) {
    const newChecked = note.checklist_data?.includes(index) ? note.checklist_data.filter(i => i !== index) : [...(note.checklist_data || []), index];
    const { error } = await supabase.from('student_notes').update({ checklist_data: newChecked }).eq('id', note.id);
    if (!error) setNotes(prev => prev.map(n => n.id === note.id ? { ...n, checklist_data: newChecked } : n));
  }

  async function handleUpdateNote(id: string) {
    if (!editingContent.trim()) return;
    setIsUpdating(true);
    try {
      const formattedName = toTitleCase(editingStudentName.trim());
      const { error } = await supabase.from('student_notes').update({ 
        content: editingContent, 
        student_name: formattedName, 
        deadline: editingDeadline || null 
      }).eq('id', id);
      if (!error) {
        setNotes(notes.map(n => n.id === id ? { ...n, content: editingContent, student_name: formattedName, deadline: editingDeadline || null } : n));
        setEditingNoteId(null);
      }
    } finally { setIsUpdating(false); }
  }

  async function handleDeleteBulk() {
    setIsDeletingBulk(true);
    try {
      const { error } = await supabase.from('student_notes').delete().in('id', selectedNoteIds);
      if (!error) {
        setNotes(notes.filter(n => !selectedNoteIds.includes(n.id)));
        setSelectedNoteIds([]); setShowBulkConfirm(false);
      }
    } finally { setIsDeletingBulk(false); }
  }

  async function handleMergeNotes() {
    if (selectedNoteIds.length < 2) return;
    setIsMergingBulk(true);
    try {
      const selectedNotes = notes.filter(n => selectedNoteIds.includes(n.id));
      const firstNote = selectedNotes[0];
      
      // Combine content
      const combinedContent = selectedNotes
        .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
        .map(n => n.content)
        .join('\n\n---\n\n');
      
      // Combine tags
      const combinedTags = Array.from(new Set(selectedNotes.flatMap(n => n.tags)));
      
      // Use the latest deadline if any
      const deadlines = selectedNotes.map(n => n.deadline).filter(Boolean) as string[];
      const latestDeadline = deadlines.length > 0 
        ? deadlines.sort((a, b) => new Date(b).getTime() - new Date(a).getTime())[0]
        : null;

      // Create new merged note
      const { data, error: insertError } = await supabase.from('student_notes').insert([{
        content: combinedContent,
        student_name: toTitleCase(firstNote.student_name),
        user_id: session.user.id,
        tags: combinedTags,
        deadline: latestDeadline,
        is_pinned: selectedNotes.some(n => n.is_pinned)
      }]).select();

      if (insertError) throw insertError;

      // Delete old notes
      const { error: deleteError } = await supabase.from('student_notes').delete().in('id', selectedNoteIds);
      if (deleteError) throw deleteError;

      if (data) {
        setNotes(prev => [data[0], ...prev.filter(n => !selectedNoteIds.includes(n.id))]);
        setSelectedNoteIds([]);
      }
    } catch (err) {
      console.error('Merge error:', err);
      alert('Failed to merge notes');
    } finally {
      setIsMergingBulk(false);
    }
  }

  const handleTogglePin = async (note: Note) => {
    const { error } = await supabase.from('student_notes').update({ is_pinned: !note.is_pinned }).eq('id', note.id);
    if (!error) fetchNotes(session.user.id);
  };

  const startEditing = (note: Note) => {
    setEditingNoteId(note.id);
    setEditingContent(note.content);
    setEditingStudentName(note.student_name);
    setEditingDeadline(note.deadline ? new Date(note.deadline).toISOString().split('T')[0] : '');
  };

  const setSchoolYearDates = () => {
    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth() + 1; // 1-indexed

    let startYear, endYear;
    if (currentMonth >= 8) {
      startYear = currentYear;
      endYear = currentYear + 1;
    } else {
      startYear = currentYear - 1;
      endYear = currentYear;
    }

    setExportStartDate(`${startYear}-08-01`);
    setExportEndDate(`${endYear}-07-31`);
  };

  const handleExportPDF = () => {
    const doc = new jsPDF();
    
    let filtered = notes;
    
    // Filter by student
    if (exportStudent !== 'All') {
      filtered = filtered.filter(n => toTitleCase(n.student_name || 'Unknown').trim() === exportStudent);
    }
    
    // Filter by date range
    if (exportStartDate) {
      const start = new Date(exportStartDate);
      start.setHours(0, 0, 0, 0);
      filtered = filtered.filter(n => new Date(n.created_at) >= start);
    }
    
    if (exportEndDate) {
      const end = new Date(exportEndDate);
      end.setHours(23, 59, 59, 999);
      filtered = filtered.filter(n => new Date(n.created_at) <= end);
    }

    // Sort by date
    filtered.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());

    doc.setFontSize(18);
    doc.text(`Student Log: ${exportStudent === 'All' ? 'All Students' : exportStudent}`, 14, 20);
    
    doc.setFontSize(10);
    doc.setTextColor(100);
    const dateRangeText = (exportStartDate || exportEndDate) 
      ? `Range: ${exportStartDate || 'Beginning'} to ${exportEndDate || 'Present'}`
      : 'Range: All Time';
    doc.text(dateRangeText, 14, 28);
    doc.text(`Generated: ${new Date().toLocaleString()}`, 14, 34);

    // Translation Logic for Admin Note
    const translateToAdminNote = (content: string): string => {
      const translations: Record<string, string> = {
        'disruption': 'Student demonstrated difficulty maintaining classroom expectations, specifically regarding vocalizing without permission or interrupting direct instruction [count] time(s).',
        'peer conflict': 'Student engaged in a social disagreement or interpersonal friction with a classmate requiring redirection to social-emotional strategies.',
        'distracted': 'Student required multiple prompts to maintain focus on the assigned task and minimize off-peak behaviors during independent work.',
        'missing hw': 'Student did not submit the required homework assignment, potentially impacting mastery of current learning objectives.',
        'unprepared': 'Student arrived at the lesson without necessary materials, causing a delay in their engagement with the learning activity.',
        'participation': 'Student was an active and engaged contributor to class discussions, showing a strong willingness to share ideas.',
        'kindness': 'Student demonstrated commendable character by showing empathy and support toward a classmate.',
        'persistence': 'Student showed significant resilience and effort when faced with a challenging task, working through difficulties to a successful outcome.'
      };

      const results: string[] = [];
      
      // We iterate through keywords and find them in content
      Object.keys(translations).forEach(keyword => {
        // Look for keyword followed by optional x[number]
        const regex = new RegExp(`\\b${keyword}\\b(?:\\s+x(\\d+))?`, 'gi');
        let match;
        while ((match = regex.exec(content)) !== null) {
          let translation = translations[keyword];
          if (keyword === 'disruption') {
            const count = match[1] || '1';
            translation = translation.replace('[count]', count);
          }
          results.push(translation);
        }
      });

      return results.length > 0 ? results.join(' ') : 'No specific administrative keywords noted.';
    };

    autoTable(doc, {
      startY: 40,
      head: [['Date', 'Student', 'Category', 'Content', 'Admin Note']],
      body: filtered.map(n => [
        new Date(n.created_at).toLocaleDateString(),
        n.student_name,
        n.tags.join(', '),
        n.content,
        translateToAdminNote(n.content)
      ]),
      styles: { fontSize: 8, cellPadding: 3 },
      headStyles: { fillColor: [79, 70, 229] }, // indigo-600
      columnStyles: {
        0: { cellWidth: 20 },
        1: { cellWidth: 25 },
        2: { cellWidth: 25 },
        3: { cellWidth: 50 },
        4: { cellWidth: 'auto' }
      }
    });

    const fileName = `student-log-${exportStudent.toLowerCase().replace(/\s+/g, '-')}-${new Date().toISOString().split('T')[0]}.pdf`;
    doc.save(fileName);
    setShowExportModal(false);
  };

  const handleExportTrendsPDF = () => {
    if (!trendsSummary || selectedStudent === 'All') return;
    const doc = new jsPDF();
    const date = new Date().toLocaleDateString();
    const timeframeLabel = trendsTimeframe === 'Year' ? 'School Year' : `${trendsTimeframe} Days`;

    doc.setFontSize(20);
    doc.text('Student Progress Report', 14, 22);
    
    doc.setFontSize(12);
    doc.setTextColor(100);
    doc.text(`Student: ${selectedStudent}`, 14, 32);
    doc.text(`Timeframe: ${timeframeLabel}`, 14, 38);
    doc.text(`Date: ${date}`, 14, 44);

    doc.setDrawColor(200);
    doc.line(14, 50, 196, 50);

    doc.setFontSize(11);
    doc.setTextColor(0);
    const splitText = doc.splitTextToSize(trendsSummary, 180);
    doc.text(splitText, 14, 60);

    const fileName = `${selectedStudent} - ${new Date().toISOString().split('T')[0]} - Report.pdf`;
    doc.save(fileName);
  };

  async function handleSaveRoster() {
    if (!rosterInput.trim() || !session) return;
    setIsSavingRoster(true);
    try {
      const names = rosterInput.split('\n').map(n => n.trim()).filter(Boolean);
      const studentData = names.map(name => ({
        name: toTitleCase(name),
        class_period: rosterPeriod,
        user_id: session.user.id
      }));

      const { error } = await supabase.from('students').insert(studentData);
      if (error) throw error;

      await fetchStudents(session.user.id);
      setRosterInput('');
      setShowRosterModal(false);
    } catch (err: any) {
      alert(`Failed to save roster: ${err.message}`);
    } finally {
      setIsSavingRoster(false);
    }
  }

  async function handleSummarizeTrends() {
    if (selectedStudent === 'All') return;
    setIsSummarizing(true);
    try {
      const now = new Date();
      let startDate = new Date();
      
      if (trendsTimeframe === '30') startDate.setDate(now.getDate() - 30);
      else if (trendsTimeframe === '60') startDate.setDate(now.getDate() - 60);
      else if (trendsTimeframe === '90') startDate.setDate(now.getDate() - 90);
      else if (trendsTimeframe === 'Year') {
        const currentMonth = now.getMonth() + 1;
        const startYear = currentMonth >= 8 ? now.getFullYear() : now.getFullYear() - 1;
        startDate = new Date(`${startYear}-08-01`);
      }

      const filtered = notes.filter(n => 
        toTitleCase(n.student_name) === selectedStudent && 
        new Date(n.created_at) >= startDate
      );

      if (filtered.length === 0) {
        setTrendsSummary("No notes found for this student in the selected timeframe.");
      } else {
        const summary = await summarizeNotes(filtered);
        setTrendsSummary(summary || 'No summary available.');
      }
    } finally {
      setIsSummarizing(false);
    }
  }

  async function handleSmartSearch(e: React.FormEvent) {
    e.preventDefault();
    if (!searchQuery.trim()) return;
    setIsSearching(true); setActiveSearchQuery(searchQuery);
    try {
      const [semanticIds, result] = await Promise.all([semanticSearch(searchQuery, notes), smartSearch(searchQuery, notes)]);
      setSemanticMatchIds(semanticIds); setSearchResult(result || 'No answer found.');
    } finally { setIsSearching(false); }
  }

  async function handleSummarize() {
    setIsSummarizing(true);
    try {
      const filtered = notes.filter(n => n.tags.includes(filterTag));
      const summary = await summarizeNotes(filtered);
      setSummaryResult(summary || 'No summary available.');
    } finally { setIsSummarizing(false); }
  }

  useEffect(() => {
    if (newStudentName.trim().length > 2) {
      const existingNames = Array.from(new Set(notes.map(n => n.student_name))).filter(Boolean) as string[];
      const match = findBestMatch(newStudentName, existingNames);
      if (match.toLowerCase() !== newStudentName.toLowerCase() && match !== newStudentName) {
        setNameSuggestion(match);
      } else {
        setNameSuggestion(null);
        setIsSuggestionRejected(false); // Reset rejection when name changes to something without a suggestion
      }
    } else {
      setNameSuggestion(null);
      setIsSuggestionRejected(false);
    }
  }, [newStudentName, notes]);

  const studentNamesFromNotes = Array.from(new Set(notes.map(n => toTitleCase(n.student_name || 'Unknown').trim()))).filter(Boolean).sort();

  if (loading && !session) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-zinc-50">
        <Loader2 className="w-8 h-8 animate-spin text-zinc-400" />
      </div>
    );
  }

  if (!session) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-zinc-50 p-4">
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="w-full max-w-md bg-white rounded-3xl shadow-xl shadow-zinc-200/50 border border-zinc-100 p-8"
        >
          <div className="flex flex-col items-center mb-8">
            <div className="w-12 h-12 bg-zinc-900 rounded-2xl flex items-center justify-center mb-4">
              <Activity className="text-white w-6 h-6" />
            </div>
            <h1 className="text-2xl font-semibold tracking-tight">Classroom Pulse</h1>
            <p className="text-zinc-500 text-sm mt-1">Declutter your mind. Track the wins.</p>
          </div>

          <form onSubmit={handleAuth} className="space-y-4">
            <div className="space-y-2">
              <label className="text-xs font-semibold uppercase tracking-wider text-zinc-400 ml-1">Email</label>
              <div className="relative">
                <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400" />
                <input 
                  type="email" 
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full pl-10 pr-4 py-3 bg-zinc-50 border border-zinc-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-zinc-900/5 focus:border-zinc-900 transition-all"
                  placeholder="name@example.com"
                  required
                />
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-xs font-semibold uppercase tracking-wider text-zinc-400 ml-1">Password</label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400" />
                <input 
                  type="password" 
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full pl-10 pr-4 py-3 bg-zinc-50 border border-zinc-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-zinc-900/5 focus:border-zinc-900 transition-all"
                  placeholder="••••••••"
                  required
                />
              </div>
            </div>

            {authError && (
              <div className="p-3 bg-red-50 border border-red-100 rounded-xl">
                <p className="text-red-600 text-xs text-center font-medium">{authError}</p>
              </div>
            )}

            {authSuccess && (
              <div className="p-3 bg-emerald-50 border border-emerald-100 rounded-xl">
                <p className="text-emerald-600 text-xs text-center font-medium">{authSuccess}</p>
              </div>
            )}

            <button 
              type="submit"
              disabled={loading}
              className="w-full bg-zinc-900 text-white py-3 rounded-xl font-medium hover:bg-zinc-800 transition-colors flex items-center justify-center gap-2"
            >
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : (authMode === 'login' ? 'Sign In' : 'Create Account')}
            </button>
          </form>

          <div className="mt-6 text-center">
            <button 
              onClick={() => {
                setAuthMode(authMode === 'login' ? 'signup' : 'login');
                setAuthError(null);
                setAuthSuccess(null);
              }}
              className="text-sm text-zinc-500 hover:text-zinc-900 transition-colors"
            >
              {authMode === 'login' ? "Don't have an account? Sign up" : "Already have an account? Sign in"}
            </button>
          </div>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 pb-20 font-sans text-slate-900">
      <header className="sticky top-0 z-30 bg-white/80 backdrop-blur-md border-b border-slate-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 h-20 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-indigo-600 rounded-xl flex items-center justify-center shadow-lg shadow-indigo-200">
              <Activity className="text-white w-6 h-6" />
            </div>
            <div>
              <h1 className="font-bold tracking-tight text-slate-900 text-sm sm:text-lg leading-tight">Classroom Pulse</h1>
              <p className="text-[8px] sm:text-[10px] font-bold uppercase tracking-widest text-slate-400">Real-Time Insights Dashboard</p>
            </div>
          </div>
          <div className="flex items-center gap-2 sm:gap-4">
            <button 
              onClick={() => setShowRosterModal(true)}
              className="p-2 sm:px-4 sm:py-2 bg-white border border-slate-200 text-slate-600 rounded-xl text-xs font-bold hover:bg-slate-50 transition-all flex items-center gap-2 shadow-sm"
            >
              <Settings className="w-4 h-4" />
              <span className="hidden sm:inline">Manage Roster</span>
            </button>
            <button onClick={() => supabase.auth.signOut()} className="p-2 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-xl transition-all">
              <LogOut className="w-5 h-5" />
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 py-6 sm:py-8 flex flex-col lg:flex-row gap-8">
        <aside className="hidden lg:block w-72 space-y-6">
          <div className="bg-white rounded-[32px] p-6 shadow-sm border border-slate-200">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-[10px] font-bold uppercase tracking-widest text-slate-400 flex items-center gap-2">
                <Users className="w-3 h-3" /> Student Roster
              </h2>
              <button onClick={() => setSelectedStudent('All')} className={cn("text-[10px] font-bold uppercase tracking-widest transition-colors", selectedStudent === 'All' ? "text-indigo-600" : "text-slate-400 hover:text-slate-600")}>
                View All
              </button>
            </div>

            <div className="space-y-4">
              {/* AM Class */}
              <div className="space-y-2">
                <button 
                  onClick={() => setIsAmExpanded(!isAmExpanded)}
                  className="w-full flex items-center justify-between p-3 bg-slate-50 rounded-2xl text-xs font-bold text-slate-600 hover:bg-slate-100 transition-colors"
                >
                  <span className="flex items-center gap-2">
                    <Clock className="w-3.5 h-3.5 text-indigo-500" />
                    AM Class
                  </span>
                  {isAmExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                </button>
                <AnimatePresence>
                  {isAmExpanded && (
                    <motion.div 
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      className="overflow-hidden space-y-1 pl-2"
                    >
                      {students.filter(s => s.class_period === 'AM').length === 0 ? (
                        <p className="text-[10px] text-slate-400 py-2 px-4 italic">No students added</p>
                      ) : (
                        students.filter(s => s.class_period === 'AM').map(s => (
                          <button 
                            key={s.id} 
                            onClick={() => setSelectedStudent(s.name)}
                            className={cn(
                              "w-full text-left px-4 py-2.5 rounded-xl text-sm font-medium transition-all truncate flex items-center gap-3",
                              selectedStudent === s.name ? "bg-indigo-50 text-indigo-700 shadow-sm shadow-indigo-100" : "text-slate-500 hover:bg-slate-50"
                            )}
                          >
                            <div className={cn("w-1.5 h-1.5 rounded-full", selectedStudent === s.name ? "bg-indigo-500" : "bg-slate-200")} />
                            <span className="flex-1 truncate">{s.name}</span>
                            {getInvisibilityAlert(s.name) && (
                              <Sparkles className="w-3 h-3 text-indigo-400 animate-pulse flex-shrink-0" title="Needs a Social/Kindness win!" />
                            )}
                          </button>
                        ))
                      )}
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              {/* PM Class */}
              <div className="space-y-2">
                <button 
                  onClick={() => setIsPmExpanded(!isPmExpanded)}
                  className="w-full flex items-center justify-between p-3 bg-slate-50 rounded-2xl text-xs font-bold text-slate-600 hover:bg-slate-100 transition-colors"
                >
                  <span className="flex items-center gap-2">
                    <Clock className="w-3.5 h-3.5 text-indigo-500" />
                    PM Class
                  </span>
                  {isPmExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                </button>
                <AnimatePresence>
                  {isPmExpanded && (
                    <motion.div 
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      className="overflow-hidden space-y-1 pl-2"
                    >
                      {students.filter(s => s.class_period === 'PM').length === 0 ? (
                        <p className="text-[10px] text-slate-400 py-2 px-4 italic">No students added</p>
                      ) : (
                        students.filter(s => s.class_period === 'PM').map(s => (
                          <button 
                            key={s.id} 
                            onClick={() => setSelectedStudent(s.name)}
                            className={cn(
                              "w-full text-left px-4 py-2.5 rounded-xl text-sm font-medium transition-all truncate flex items-center gap-3",
                              selectedStudent === s.name ? "bg-indigo-50 text-indigo-700 shadow-sm shadow-indigo-100" : "text-slate-500 hover:bg-slate-50"
                            )}
                          >
                            <div className={cn("w-1.5 h-1.5 rounded-full", selectedStudent === s.name ? "bg-indigo-500" : "bg-slate-200")} />
                            <span className="flex-1 truncate">{s.name}</span>
                            {getInvisibilityAlert(s.name) && (
                              <Sparkles className="w-3 h-3 text-indigo-400 animate-pulse flex-shrink-0" title="Needs a Social/Kindness win!" />
                            )}
                          </button>
                        ))
                      )}
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-[32px] p-6 shadow-sm border border-slate-200">
            <h2 className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-4 flex items-center gap-2">
              <Sparkles className="w-3 h-3" /> Personal Reflection
            </h2>
            <div className="space-y-3">
              <textarea
                value={personalReflection}
                onChange={(e) => setPersonalReflection(e.target.value)}
                placeholder="Daily win or mood..."
                className="w-full p-3 bg-slate-50 border border-slate-100 rounded-xl text-xs resize-none min-h-[80px] focus:outline-none focus:border-indigo-500 transition-all"
              />
              <button
                onClick={handleSaveReflection}
                disabled={isSavingReflection}
                className="w-full py-2 bg-slate-900 text-white rounded-xl text-[10px] font-bold uppercase tracking-widest hover:bg-slate-800 transition-all flex items-center justify-center gap-2"
              >
                {isSavingReflection ? <Loader2 className="w-3 h-3 animate-spin" /> : 'Save Reflection'}
              </button>
            </div>
          </div>

          <div className="bg-slate-900 rounded-[32px] p-6 shadow-xl shadow-slate-200">
            <h2 className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-4 flex items-center gap-2">
              <Tag className="w-3 h-3" /> Categories
            </h2>
            <div className="space-y-1">
              <button 
                onClick={() => setFilterTag('All')} 
                className={cn(
                  "w-full text-left px-4 py-2.5 rounded-xl text-sm font-medium transition-all", 
                  filterTag === 'All' ? "bg-white text-slate-900 shadow-lg shadow-white/10" : "text-slate-400 hover:text-slate-200"
                )}
              >
                All Categories
              </button>
              {AVAILABLE_TAGS.map(t => (
                <button 
                  key={t} 
                  onClick={() => setFilterTag(t)} 
                  className={cn(
                    "w-full text-left px-4 py-2.5 rounded-xl text-sm font-medium transition-all", 
                    filterTag === t ? "bg-white text-slate-900 shadow-lg shadow-white/10" : "text-slate-400 hover:text-slate-200"
                  )}
                >
                  {t}
                </button>
              ))}
            </div>
          </div>
        </aside>

        <div className="flex-1 space-y-6 sm:space-y-8">
          {/* Note Creation Form */}
          <section className="bg-white rounded-[32px] border border-slate-200 shadow-sm overflow-hidden transition-all focus-within:border-indigo-500 focus-within:ring-4 focus-within:ring-indigo-500/5">
            <div className="p-4 bg-slate-50/50 border-b border-slate-100 flex flex-col sm:flex-row gap-3">
              <div className="flex-1 relative">
                <Activity className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <input 
                  type="text" 
                  value={newStudentName} 
                  onChange={e => setNewStudentName(e.target.value)} 
                  placeholder="Student Name" 
                  className="w-full pl-11 pr-4 py-3 bg-white border border-slate-200 rounded-2xl text-sm focus:outline-none focus:border-indigo-500 transition-all" 
                />
                <AnimatePresence>
                  {nameSuggestion && !isSuggestionRejected && (
                    <motion.div
                      initial={{ opacity: 0, y: -5 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -5 }}
                      className="absolute left-0 top-full mt-2 bg-slate-900 text-white rounded-xl shadow-xl z-20 flex items-stretch overflow-hidden border border-white/10"
                    >
                      <button
                        type="button"
                        onClick={() => {
                          setNewStudentName(nameSuggestion);
                          setNameSuggestion(null);
                        }}
                        className="px-4 py-2 text-[10px] font-bold uppercase tracking-widest flex items-center gap-2 hover:bg-slate-800 transition-colors border-r border-white/10"
                      >
                        <Sparkles className="w-3.5 h-3.5 text-indigo-400" />
                        Did you mean {nameSuggestion}?
                      </button>
                      <button
                        type="button"
                        onClick={() => setIsSuggestionRejected(true)}
                        className="px-3 hover:bg-red-500 transition-colors flex items-center justify-center"
                        title="No, this is a different student"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
              <div className="flex gap-2">
                <button 
                  type="button" 
                  onClick={() => setIsParentComm(!isParentComm)}
                  className={cn(
                    "px-4 py-2 rounded-2xl text-[10px] font-bold uppercase tracking-widest flex items-center gap-2 transition-all border",
                    isParentComm ? "bg-indigo-600 text-white border-indigo-600 shadow-lg shadow-indigo-200" : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50"
                  )}
                >
                  <MessageCircle className="w-3.5 h-3.5" />
                  Parent Comm
                </button>
                <button type="button" onClick={toggleVoiceLog} className={cn("px-4 py-2 rounded-2xl text-[10px] font-bold uppercase tracking-widest flex items-center gap-2 transition-all border", isVoiceLogging ? "bg-red-500 text-white border-red-500 animate-pulse shadow-lg shadow-red-200" : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50")}>
                  {isParsingVoice ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Mic className="w-3.5 h-3.5" />} {isParsingVoice ? 'Parsing...' : 'Voice Log'}
                </button>
              </div>
            </div>

            {isParentComm && (
              <div className="px-6 py-4 bg-indigo-50/50 border-b border-indigo-100 flex flex-wrap gap-2">
                {(['ParentSquare', 'Phone', 'Email', 'Meeting'] as const).map(type => (
                  <button
                    key={type}
                    type="button"
                    onClick={() => setParentCommType(type)}
                    className={cn(
                      "px-3 py-1.5 rounded-xl text-[10px] font-bold uppercase tracking-widest transition-all flex items-center gap-2",
                      parentCommType === type ? "bg-indigo-600 text-white shadow-md shadow-indigo-200" : "bg-white text-indigo-600 border border-indigo-100 hover:bg-indigo-50"
                    )}
                  >
                    {type === 'Phone' && <Phone className="w-3 h-3" />}
                    {type === 'Email' && <Mail className="w-3 h-3" />}
                    {type === 'ParentSquare' && <MessageSquare className="w-3 h-3" />}
                    {type === 'Meeting' && <Users className="w-3 h-3" />}
                    {type}
                  </button>
                ))}
              </div>
            )}

            <div className="px-6 py-4 bg-slate-50/50 border-b border-slate-100 flex flex-wrap gap-2">
              {INCIDENT_TEMPLATES.map(template => (
                <button
                  key={template.label}
                  type="button"
                  onClick={() => {
                    const keyword = template.text;
                    setNewNote(prev => {
                      if (!prev.trim()) return keyword;
                      
                      // Check if keyword already exists with a count
                      const regex = new RegExp(`\\b${keyword}\\b(?:\\s+x(\\d+))?`, 'i');
                      const match = prev.match(regex);
                      
                      if (match) {
                        const currentCount = parseInt(match[1] || '1', 10);
                        const newCount = currentCount + 1;
                        return prev.replace(regex, `${keyword} x${newCount}`);
                      } else {
                        return `${prev.trim()} ${keyword}`;
                      }
                    });
                  }}
                  className="px-3 py-1.5 bg-white border border-slate-200 text-slate-600 rounded-xl text-[10px] font-bold uppercase tracking-widest hover:border-indigo-500 hover:text-indigo-600 transition-all shadow-sm"
                >
                  {template.label}
                </button>
              ))}
            </div>

            <textarea 
              value={newNote} 
              onChange={e => setNewNote(e.target.value)} 
              placeholder={isParentComm ? "Log details of the parent communication..." : "Write a professional observation..."} 
              className="w-full p-8 min-h-[160px] focus:outline-none text-sm resize-none leading-relaxed text-slate-700" 
            />
            
            {imagePreview && (
              <div className="px-8 pb-6 flex gap-2">
                <div className="relative group">
                  <img src={imagePreview} className="w-24 h-24 object-cover rounded-2xl border-2 border-slate-100 shadow-sm transition-all group-hover:border-indigo-500" />
                  <button onClick={() => { setSelectedImage(null); setImagePreview(null); }} className="absolute -top-3 -right-3 bg-red-500 text-white p-1.5 rounded-full shadow-lg hover:bg-red-600 transition-all"><X className="w-4 h-4" /></button>
                </div>
              </div>
            )}

            <div className="p-6 bg-slate-50/50 border-t border-slate-100 flex items-center justify-between">
              <div className="flex gap-2">
                <button onClick={() => fileInputRef.current?.click()} className="p-3 rounded-2xl text-slate-400 hover:bg-white hover:text-indigo-600 hover:shadow-sm transition-all"><ImageIcon className="w-5 h-5" /></button>
                <button onClick={toggleListening} className={cn("p-3 rounded-2xl transition-all", isListening ? "bg-red-500 text-white shadow-lg shadow-red-200" : "text-slate-400 hover:bg-white hover:text-indigo-600 hover:shadow-sm")}><Mic className="w-5 h-5" /></button>
                <button onClick={() => setIsChecklistMode(!isChecklistMode)} className={cn("p-3 rounded-2xl transition-all", isChecklistMode ? "bg-slate-900 text-white shadow-lg shadow-slate-200" : "text-slate-400 hover:bg-white hover:text-indigo-600 hover:shadow-sm")}><CheckSquare className="w-5 h-5" /></button>
                <input type="file" ref={fileInputRef} onChange={handleImageSelect} accept="image/*" className="hidden" />
              </div>
              <div className="flex gap-3">
                <div className="relative">
                  <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
                  <input type="date" value={newNoteDeadline} onChange={e => setNewNoteDeadline(e.target.value)} className="bg-white border border-slate-200 rounded-2xl pl-9 pr-4 py-2.5 text-[10px] font-bold uppercase tracking-widest text-slate-600 focus:outline-none focus:border-indigo-500 transition-all" />
                </div>
                <button
                  onClick={(e) => handleAddNote(e)}
                  disabled={isSaving || (!(newNote || '').trim() && !selectedImage)}
                  className="bg-indigo-600 text-white px-3 sm:px-8 py-2 sm:py-2.5 rounded-xl sm:rounded-2xl text-[10px] sm:text-xs font-bold hover:bg-indigo-700 disabled:opacity-50 transition-all flex items-center gap-1.5 sm:gap-2 shadow-lg shadow-indigo-200"
                >
                  {isSaving ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <>
                      <Plus className="w-3.5 h-3.5 sm:w-4 sm:h-4" /> 
                      <span className="hidden sm:inline">SAVE LOG</span>
                      <span className="sm:hidden">SAVE</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          </section>

          {/* Search Section */}
          <section className="bg-white rounded-[32px] p-4 shadow-sm border border-slate-200">
            <form onSubmit={handleSmartSearch} className="relative">
              <Search className="absolute left-5 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
              <input 
                type="text" 
                value={searchQuery} 
                onChange={e => setSearchQuery(e.target.value)} 
                placeholder="Ask AI about your logs..." 
                className="w-full pl-10 sm:pl-12 pr-32 sm:pr-40 py-3 sm:py-4 bg-slate-50 border border-slate-100 rounded-2xl sm:rounded-[24px] focus:outline-none focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/5 text-sm transition-all" 
              />
              <div className="absolute right-2 sm:right-3 top-1/2 -translate-y-1/2 flex gap-1.5 sm:gap-2">
                <button type="button" onClick={toggleSearchListening} className={cn("p-1.5 sm:p-2.5 rounded-xl transition-all", isSearchListening ? "bg-red-500 text-white animate-pulse shadow-lg shadow-red-200" : "text-slate-400 hover:bg-slate-100")}><Mic className="w-4 h-4 sm:w-5 sm:h-5" /></button>
                <button type="submit" disabled={isSearching || !searchQuery.trim()} className="bg-indigo-600 text-white px-3 sm:px-5 py-1.5 sm:py-2 rounded-lg sm:rounded-xl text-[10px] sm:text-xs font-bold disabled:opacity-50 shadow-lg shadow-indigo-200 hover:bg-indigo-700 transition-all">
                  {isSearching ? <Loader2 className="w-3.5 h-3.5 sm:w-4 sm:h-4 animate-spin" /> : (
                    <>
                      <span className="hidden sm:inline">ASK AI</span>
                      <span className="sm:hidden">ASK</span>
                    </>
                  )}
                </button>
              </div>
            </form>
            {searchResult && (
              <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="mt-4 p-6 bg-slate-900 text-slate-100 rounded-[24px] text-sm relative shadow-xl">
                <button onClick={() => { setSearchResult(null); setSemanticMatchIds([]); }} className="absolute top-4 right-4 p-1.5 text-slate-500 hover:text-white hover:bg-white/10 rounded-lg transition-all"><X className="w-4 h-4" /></button>
                <div className="flex gap-4">
                  <div className="w-8 h-8 rounded-lg bg-indigo-500/20 flex items-center justify-center flex-shrink-0">
                    <Sparkles className="w-4 h-4 text-indigo-400" />
                  </div>
                  <p className="leading-relaxed">{searchResult}</p>
                </div>
              </motion.div>
            )}
          </section>

          {/* Student Folder Header */}
          {selectedStudent !== 'All' && (
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 px-2">
              <div className="flex items-center gap-4">
                <div className="w-14 h-14 bg-indigo-100 rounded-2xl flex items-center justify-center shadow-sm">
                  <User className="w-7 h-7 text-indigo-600" />
                </div>
                <div>
                  <h2 className="text-2xl font-bold text-slate-900">{selectedStudent}'s Digital Folder</h2>
                  <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">
                    {students.find(s => s.name === selectedStudent)?.class_period} Class • {notes.filter(n => toTitleCase(n.student_name) === selectedStudent).length} Observations
                  </p>
                </div>
              </div>
              <div className="flex gap-3">
                <button 
                  onClick={() => setShowTrendsModal(true)}
                  className="px-5 py-2.5 bg-indigo-600 text-white rounded-xl text-xs font-bold hover:bg-indigo-700 transition-all flex items-center gap-2 shadow-lg shadow-indigo-200"
                >
                  <TrendingUp className="w-4 h-4" />
                  View Trends
                </button>
                <button 
                  onClick={() => {
                    setExportStudent(selectedStudent);
                    setShowExportModal(true);
                  }}
                  className="px-5 py-2.5 bg-white border border-slate-200 text-slate-600 rounded-xl text-xs font-bold hover:bg-slate-50 transition-all flex items-center gap-2 shadow-sm"
                >
                  <Download className="w-4 h-4" />
                  Export PDF
                </button>
              </div>
            </div>
          )}

          {/* Activity Section */}
          <div className="flex items-center justify-between px-2">
            <h2 className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Recent Activity</h2>
            <div className="flex gap-4">
              {selectedStudent === 'All' && (
                <button
                  onClick={() => setShowExportModal(true)}
                  className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-slate-500 hover:text-indigo-600 transition-colors"
                >
                  <Download className="w-3.5 h-3.5" /> Export PDF
                </button>
              )}
              {filterTag !== 'All' && <button onClick={handleSummarize} className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-indigo-600 hover:text-indigo-700 transition-colors"><Sparkles className="w-3.5 h-3.5" /> Summarize Category</button>}
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <AnimatePresence mode="popLayout">
              {notes.filter(n => (filterTag === 'All' || n.tags.includes(filterTag as any)) && (selectedStudent === 'All' || toTitleCase(n.student_name || 'Unknown') === selectedStudent)).map(note => (
                <motion.div 
                  key={note.id} 
                  layout 
                  initial={{ opacity: 0, scale: 0.95 }} 
                  animate={{ opacity: 1, scale: 1 }} 
                  exit={{ opacity: 0, scale: 0.95 }} 
                  className={cn(
                    "group bg-white rounded-[32px] border p-8 shadow-sm hover:shadow-xl hover:-translate-y-1 transition-all relative overflow-hidden", 
                    note.is_pinned ? "border-indigo-500 ring-1 ring-indigo-500/5" : "border-slate-100"
                  )}
                >
                  <div className="flex items-start justify-between mb-6">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-2xl bg-slate-50 flex items-center justify-center group-hover:bg-indigo-50 transition-colors">
                        <User className="w-5 h-5 text-slate-400 group-hover:text-indigo-500 transition-colors" />
                      </div>
                      <div>
                        <span className="text-sm font-bold text-slate-900 block">{note.student_name}</span>
                        <span className="text-[9px] font-bold text-slate-300 uppercase tracking-widest">{new Date(note.created_at).toLocaleDateString()}</span>
                      </div>
                    </div>
                    <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-all">
                      <button 
                        onClick={() => handleDraftParentSquare(note)} 
                        disabled={isDraftingParentSquare === note.id}
                        className="p-2 text-slate-300 hover:text-indigo-600 hover:bg-indigo-50 rounded-xl transition-all"
                        title="Draft for ParentSquare"
                      >
                        {isDraftingParentSquare === note.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <MessageSquare className="w-4 h-4" />}
                      </button>
                      <button onClick={() => startEditing(note)} className="p-2 text-slate-300 hover:text-indigo-600 hover:bg-indigo-50 rounded-xl transition-all"><Edit2 className="w-4 h-4" /></button>
                      <button onClick={() => handleTogglePin(note)} className={cn("p-2 rounded-xl transition-all", note.is_pinned ? "text-indigo-600 bg-indigo-50" : "text-slate-300 hover:text-indigo-600 hover:bg-indigo-50")}><Pin className={cn("w-4 h-4", note.is_pinned && "fill-current")} /></button>
                      <button onClick={() => handleDeleteNote(note.id)} className="p-2 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-xl transition-all"><Trash2 className="w-4 h-4" /></button>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 mb-6">
                    <input
                      type="checkbox"
                      checked={selectedNoteIds.includes(note.id)}
                      onChange={(e) => {
                        if (e.target.checked) setSelectedNoteIds([...selectedNoteIds, note.id]);
                        else setSelectedNoteIds(selectedNoteIds.filter(id => id !== note.id));
                      }}
                      className="w-5 h-5 rounded-lg border-slate-200 text-indigo-600 focus:ring-indigo-500 transition-all"
                    />
                    <div className="flex gap-1.5 flex-wrap">
                      {note.is_parent_communication && (
                        <span className="px-2.5 py-1 bg-indigo-600 text-white rounded-lg text-[9px] font-bold uppercase tracking-widest flex items-center gap-1.5 shadow-sm">
                          <MessageCircle className="w-2.5 h-2.5" />
                          {note.parent_communication_type || 'Comm'}
                        </span>
                      )}
                      {note.tags.map(t => <span key={t} className="px-2.5 py-1 bg-slate-100 text-slate-500 rounded-lg text-[9px] font-bold uppercase tracking-widest">{t}</span>)}
                      {semanticMatchIds.includes(note.id) && <span className="px-2.5 py-1 bg-emerald-100 text-emerald-600 rounded-lg text-[9px] font-bold uppercase tracking-widest flex items-center gap-1.5"><Sparkles className="w-2.5 h-2.5" /> Match</span>}
                    </div>
                  </div>

                  {note.image_url && <img src={note.image_url} className="w-full h-48 object-cover rounded-[24px] mb-6 border border-slate-100 shadow-sm" referrerPolicy="no-referrer" />}
                  
                  {note.is_checklist ? (
                    <div className="space-y-2 mb-6">
                      {note.content.split('\n').map((line, i) => line.trim() && (
                        <div key={i} onClick={() => handleToggleChecklistItem(note, i)} className="flex items-center gap-3 cursor-pointer group/item p-2 hover:bg-slate-50 rounded-xl transition-all">
                          {note.checklist_data?.includes(i) ? <CheckSquare className="w-4.5 h-4.5 text-indigo-600" /> : <Square className="w-4.5 h-4.5 text-slate-200 group-hover/item:text-slate-400" />}
                          <span className={cn("text-sm transition-all", note.checklist_data?.includes(i) ? "text-slate-300 line-through" : "text-slate-600")}>{line}</span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-slate-600 leading-relaxed mb-6 whitespace-pre-wrap">{note.content}</p>
                  )}

                  <div className="flex items-center justify-between mt-auto pt-6 border-t border-slate-50">
                    <span className="text-[9px] font-bold text-slate-300 uppercase tracking-widest">{new Date(note.created_at).toLocaleDateString()}</span>
                    {note.deadline && (
                      <span className="text-[10px] font-bold text-indigo-600 uppercase tracking-widest flex items-center gap-2 bg-indigo-50 w-fit px-3 py-1.5 rounded-lg">
                        <Clock className="w-3 h-3" /> 
                        Due: {new Date(note.deadline).toLocaleDateString()}
                      </span>
                    )}
                  </div>
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        </div>
      </main>

      <AnimatePresence>
        {selectedNoteIds.length > 0 && (
          <motion.div 
            initial={{ y: 100, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 100, opacity: 0 }}
            className="fixed bottom-8 left-1/2 -translate-x-1/2 z-40 bg-zinc-900 text-white px-6 py-4 rounded-2xl shadow-2xl flex items-center gap-6 border border-white/10 backdrop-blur-xl"
          >
            <div className="flex items-center gap-3 pr-6 border-r border-white/10">
              <span className="text-xs font-bold uppercase tracking-widest">{selectedNoteIds.length} selected</span>
              <button onClick={() => setSelectedNoteIds([])} className="text-[10px] font-bold uppercase tracking-widest text-zinc-400 hover:text-white transition-colors">Clear</button>
            </div>
            <div className="flex gap-4">
              <button 
                onClick={handleMergeNotes}
                disabled={selectedNoteIds.length < 2 || isMergingBulk}
                className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest hover:text-emerald-400 disabled:opacity-30 transition-colors"
              >
                {isMergingBulk ? <Loader2 className="w-3 h-3 animate-spin" /> : <Copy className="w-3 h-3" />}
                Merge Notes
              </button>
              <button 
                onClick={() => setShowBulkConfirm(true)}
                disabled={isDeletingBulk}
                className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest hover:text-red-400 disabled:opacity-30 transition-colors"
              >
                {isDeletingBulk ? <Loader2 className="w-3 h-3 animate-spin" /> : <Trash2 className="w-3 h-3" />}
                Delete
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {editingNoteId && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm">
            <motion.div 
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              className="bg-white w-full max-w-lg rounded-[32px] shadow-2xl overflow-hidden border border-slate-100"
            >
              <div className="p-6 border-b border-slate-50 flex items-center justify-between bg-slate-50/50">
                <div className="flex items-center gap-2">
                  <Edit2 className="w-4 h-4 text-slate-900" />
                  <h3 className="font-bold text-slate-900">Edit Log Entry</h3>
                </div>
                <button onClick={() => setEditingNoteId(null)} className="p-2 hover:bg-slate-100 rounded-full transition-colors">
                  <X className="w-4 h-4 text-slate-400" />
                </button>
              </div>
              <div className="p-8 space-y-6">
                <div className="space-y-2">
                  <label className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Student Name</label>
                  <input 
                    type="text" 
                    value={editingStudentName} 
                    onChange={e => setEditingStudentName(e.target.value)}
                    className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:border-indigo-500 transition-all"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Observation</label>
                  <textarea 
                    value={editingContent} 
                    onChange={e => setEditingContent(e.target.value)}
                    className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:border-indigo-500 min-h-[150px] resize-none leading-relaxed"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Deadline</label>
                  <input 
                    type="date" 
                    value={editingDeadline} 
                    onChange={e => setEditingDeadline(e.target.value)}
                    className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:border-indigo-500 transition-all"
                  />
                </div>
              </div>
              <div className="p-6 border-t border-slate-50 bg-slate-50/50 flex gap-3">
                <button 
                  onClick={() => setEditingNoteId(null)}
                  className="flex-1 px-6 py-3 bg-white border border-slate-200 text-slate-600 rounded-xl font-bold hover:bg-slate-50 transition-all"
                >
                  Cancel
                </button>
                <button 
                  onClick={() => handleUpdateNote(editingNoteId)}
                  disabled={isUpdating}
                  className="flex-2 px-6 py-3 bg-indigo-600 text-white rounded-xl font-bold hover:bg-indigo-700 transition-all flex items-center justify-center gap-2 shadow-lg shadow-indigo-200"
                >
                  {isUpdating ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Save Changes'}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showRosterModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm">
            <motion.div 
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              className="bg-white w-full max-w-lg rounded-[32px] shadow-2xl overflow-hidden border border-slate-100"
            >
              <div className="p-6 border-b border-slate-50 flex items-center justify-between bg-slate-50/50">
                <div className="flex items-center gap-2">
                  <Users className="w-4 h-4 text-slate-900" />
                  <h3 className="font-bold text-slate-900">Manage Roster</h3>
                </div>
                <button onClick={() => setShowRosterModal(false)} className="p-2 hover:bg-slate-100 rounded-full transition-colors">
                  <X className="w-4 h-4 text-slate-400" />
                </button>
              </div>
              <div className="p-8 space-y-6">
                <div className="space-y-2">
                  <label className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Class Period</label>
                  <div className="flex gap-2">
                    {(['AM', 'PM'] as const).map(period => (
                      <button
                        key={period}
                        onClick={() => setRosterPeriod(period)}
                        className={cn(
                          "flex-1 py-3 rounded-xl text-xs font-bold transition-all border",
                          rosterPeriod === period ? "bg-indigo-600 text-white border-indigo-600 shadow-lg shadow-indigo-200" : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50"
                        )}
                      >
                        {period} Class
                      </button>
                    ))}
                  </div>
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Student Names (One per line for bulk add)</label>
                  <textarea 
                    value={rosterInput} 
                    onChange={e => setRosterInput(e.target.value)}
                    placeholder="John Doe&#10;Jane Smith&#10;..."
                    className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:border-indigo-500 min-h-[120px] resize-none leading-relaxed"
                  />
                </div>

                <div className="space-y-4 pt-4 border-t border-slate-100">
                  <label className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Current Roster</label>
                  <div className="max-h-[200px] overflow-y-auto space-y-2 pr-2">
                    {students.map(s => (
                      <div key={s.id} className="flex items-center justify-between p-3 bg-slate-50 rounded-xl group">
                        {editingStudent?.id === s.id ? (
                          <div className="flex-1 flex gap-2">
                            <input 
                              type="text" 
                              value={editingStudent.name} 
                              onChange={e => setEditingStudent({...editingStudent, name: e.target.value})}
                              className="flex-1 px-3 py-1 bg-white border border-slate-200 rounded-lg text-sm focus:outline-none focus:border-indigo-500"
                            />
                            <select
                              value={editingStudent.class_period}
                              onChange={e => setEditingStudent({...editingStudent, class_period: e.target.value as 'AM' | 'PM'})}
                              className="px-2 py-1 bg-white border border-slate-200 rounded-lg text-xs"
                            >
                              <option value="AM">AM</option>
                              <option value="PM">PM</option>
                            </select>
                            <button onClick={handleUpdateStudent} disabled={isUpdatingStudent} className="p-1 text-emerald-600 hover:bg-emerald-50 rounded-lg">
                              {isUpdatingStudent ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckSquare className="w-4 h-4" />}
                            </button>
                            <button onClick={() => setEditingStudent(null)} className="p-1 text-slate-400 hover:bg-slate-100 rounded-lg">
                              <X className="w-4 h-4" />
                            </button>
                          </div>
                        ) : (
                          <>
                            <div className="flex flex-col">
                              <span className="text-sm font-medium text-slate-700">{s.name}</span>
                              <span className="text-[10px] text-slate-400 font-bold uppercase">{s.class_period} Class</span>
                            </div>
                            <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-all">
                              <button onClick={() => setEditingStudent(s)} className="p-1.5 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg">
                                <Edit2 className="w-3.5 h-3.5" />
                              </button>
                              <button onClick={() => handleDeleteStudent(s.id)} disabled={isDeletingStudent === s.id} className="p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg">
                                {isDeletingStudent === s.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                              </button>
                            </div>
                          </>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
              <div className="p-6 border-t border-slate-50 bg-slate-50/50 flex gap-3">
                <button 
                  onClick={() => setShowRosterModal(false)}
                  className="flex-1 px-6 py-3 bg-white border border-slate-200 text-slate-600 rounded-xl font-bold hover:bg-slate-50 transition-all"
                >
                  Cancel
                </button>
                <button 
                  onClick={handleSaveRoster}
                  disabled={isSavingRoster || !rosterInput.trim()}
                  className="flex-2 px-6 py-3 bg-indigo-600 text-white rounded-xl font-bold hover:bg-indigo-700 transition-all flex items-center justify-center gap-2 shadow-lg shadow-indigo-200"
                >
                  {isSavingRoster ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Save Roster'}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showTrendsModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm">
            <motion.div 
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              className="bg-white w-full max-w-2xl rounded-[32px] shadow-2xl overflow-hidden border border-slate-100"
            >
              <div className="p-6 border-b border-slate-50 flex items-center justify-between bg-slate-50/50">
                <div className="flex items-center gap-2">
                  <TrendingUp className="w-4 h-4 text-slate-900" />
                  <h3 className="font-bold text-slate-900">Smart Insights: {selectedStudent}</h3>
                </div>
                <button onClick={() => { setShowTrendsModal(false); setTrendsSummary(null); }} className="p-2 hover:bg-slate-100 rounded-full transition-colors">
                  <X className="w-4 h-4 text-slate-400" />
                </button>
              </div>
              <div className="p-8 space-y-6 max-h-[70vh] overflow-y-auto">
                <div className="flex gap-2 p-1 bg-slate-100 rounded-2xl sticky top-0 z-10">
                  {(['30', '60', '90', 'Year'] as const).map(tf => (
                    <button
                      key={tf}
                      onClick={() => setTrendsTimeframe(tf)}
                      className={cn(
                        "flex-1 py-2.5 rounded-xl text-[10px] font-bold uppercase tracking-widest transition-all",
                        trendsTimeframe === tf ? "bg-white text-indigo-600 shadow-sm" : "text-slate-500 hover:text-slate-700"
                      )}
                    >
                      {tf === 'Year' ? 'School Year' : `${tf} Days`}
                    </button>
                  ))}
                </div>

                <div className="min-h-[300px] flex flex-col items-center justify-center">
                  {isSummarizing ? (
                    <div className="text-center space-y-4">
                      <div className="w-16 h-16 bg-indigo-50 rounded-full flex items-center justify-center mx-auto">
                        <Loader2 className="w-8 h-8 text-indigo-600 animate-spin" />
                      </div>
                      <p className="text-sm font-medium text-slate-600">Gemini is analyzing {selectedStudent}'s logs...</p>
                    </div>
                  ) : trendsSummary ? (
                    <div className="w-full prose prose-slate max-w-none">
                      <div className="bg-slate-50 rounded-2xl p-6 border border-slate-100">
                        <div className="flex items-center gap-2 mb-4 text-indigo-600">
                          <Sparkles className="w-4 h-4" />
                          <span className="text-xs font-bold uppercase tracking-widest">AI Summary</span>
                        </div>
                        <div className="text-sm text-slate-600 leading-relaxed whitespace-pre-wrap">
                          {trendsSummary}
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="text-center space-y-4">
                      <div className="w-16 h-16 bg-slate-50 rounded-full flex items-center justify-center mx-auto">
                        <Sparkles className="w-8 h-8 text-slate-300" />
                      </div>
                      <p className="text-sm text-slate-500">Select a timeframe to generate insights</p>
                      <button
                        onClick={handleSummarizeTrends}
                        className="px-6 py-3 bg-indigo-600 text-white rounded-xl font-bold hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-200"
                      >
                        Generate Summary
                      </button>
                    </div>
                  )}
                </div>
              </div>
              <div className="p-6 border-t border-slate-50 bg-slate-50/50 flex flex-wrap gap-3 justify-end">
                {trendsSummary && (
                  <>
                    <button 
                      onClick={() => {
                        navigator.clipboard.writeText(trendsSummary);
                        alert('Report copied to clipboard!');
                      }}
                      className="flex-1 sm:flex-none px-6 py-3 bg-white border border-slate-200 text-slate-600 rounded-xl font-bold hover:bg-slate-50 transition-all flex items-center justify-center gap-2"
                    >
                      <Copy className="w-4 h-4" />
                      Copy
                    </button>
                    <button 
                      onClick={handleExportTrendsPDF}
                      className="flex-1 sm:flex-none px-6 py-3 bg-indigo-600 text-white rounded-xl font-bold hover:bg-indigo-700 transition-all flex items-center justify-center gap-2 shadow-lg shadow-indigo-200"
                    >
                      <Download className="w-4 h-4" />
                      Download PDF
                    </button>
                  </>
                )}
                <button 
                  onClick={() => { setShowTrendsModal(false); setTrendsSummary(null); }}
                  className="flex-1 sm:flex-none px-8 py-3 bg-slate-200 text-slate-700 rounded-xl font-bold hover:bg-slate-300 transition-all"
                >
                  Close
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showBulkConfirm && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm">
            <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.9 }} className="bg-white w-full max-w-md rounded-[32px] shadow-2xl overflow-hidden border border-slate-100">
              <div className="p-8 text-center space-y-6">
                <div className="w-20 h-20 bg-red-50 rounded-full flex items-center justify-center mx-auto">
                  <Trash2 className="w-10 h-10 text-red-500" />
                </div>
                <div className="space-y-2">
                  <h3 className="text-xl font-bold text-slate-900">Delete {selectedNoteIds.length} Logs?</h3>
                  <p className="text-sm text-slate-500">This action cannot be undone. Are you sure you want to proceed?</p>
                </div>
                <div className="flex gap-3">
                  <button onClick={() => setShowBulkConfirm(false)} className="flex-1 px-6 py-3 bg-slate-100 text-slate-600 rounded-xl font-bold hover:bg-slate-200 transition-all">Cancel</button>
                  <button onClick={handleDeleteBulk} className="flex-1 px-6 py-3 bg-red-500 text-white rounded-xl font-bold hover:bg-red-600 transition-all shadow-lg shadow-red-200">Delete All</button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {summaryResult && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm">
            <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.9 }} className="bg-white w-full max-w-2xl rounded-[32px] shadow-2xl overflow-hidden border border-slate-100">
              <div className="p-6 border-b border-slate-50 flex items-center justify-between bg-slate-50/50">
                <div className="flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-indigo-600" />
                  <h3 className="font-bold text-slate-900">AI Summary</h3>
                </div>
                <button onClick={() => setSummaryResult(null)} className="p-2 hover:bg-slate-100 rounded-full transition-colors">
                  <X className="w-4 h-4 text-slate-400" />
                </button>
              </div>
              <div className="p-8 max-h-[60vh] overflow-y-auto">
                <div className="bg-slate-50 rounded-2xl p-6 border border-slate-100 text-sm text-slate-600 leading-relaxed whitespace-pre-wrap">
                  {summaryResult}
                </div>
              </div>
              <div className="p-6 border-t border-slate-50 bg-slate-50/50 flex justify-end">
                <button onClick={() => setSummaryResult(null)} className="px-8 py-3 bg-indigo-600 text-white rounded-xl font-bold hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-200">Done</button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {parentSquareDraft && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm">
            <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.9 }} className="bg-white w-full max-w-lg rounded-[32px] shadow-2xl overflow-hidden border border-slate-100">
              <div className="p-6 border-b border-slate-50 flex items-center justify-between bg-slate-50/50">
                <div className="flex items-center gap-2">
                  <MessageSquare className="w-4 h-4 text-indigo-600" />
                  <h3 className="font-bold text-slate-900">ParentSquare Draft</h3>
                </div>
                <button onClick={() => setParentSquareDraft(null)} className="p-2 hover:bg-slate-100 rounded-full transition-colors">
                  <X className="w-4 h-4 text-slate-400" />
                </button>
              </div>
              <div className="p-8">
                <div className="bg-slate-50 rounded-2xl p-6 border border-slate-100 text-sm text-slate-600 leading-relaxed whitespace-pre-wrap">
                  {parentSquareDraft}
                </div>
              </div>
              <div className="p-6 border-t border-slate-50 bg-slate-50/50 flex gap-3">
                <button 
                  onClick={() => {
                    navigator.clipboard.writeText(parentSquareDraft);
                    alert('Copied to clipboard!');
                  }}
                  className="flex-1 px-6 py-3 bg-white border border-slate-200 text-slate-600 rounded-xl font-bold hover:bg-slate-50 transition-all flex items-center justify-center gap-2"
                >
                  <Copy className="w-4 h-4" />
                  Copy Text
                </button>
                <button onClick={() => setParentSquareDraft(null)} className="flex-1 px-8 py-3 bg-indigo-600 text-white rounded-xl font-bold hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-200">Done</button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showExportModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm">
            <motion.div 
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="bg-white w-full max-w-md rounded-[32px] shadow-2xl overflow-hidden border border-slate-100"
            >
              <div className="p-6 border-b border-slate-50 flex items-center justify-between bg-slate-50/50">
                <div className="flex items-center gap-2">
                  <Download className="w-5 h-5 text-slate-900" />
                  <h3 className="font-bold text-slate-900">Export PDF Report</h3>
                </div>
                <button 
                  onClick={() => setShowExportModal(false)}
                  className="p-2 hover:bg-slate-100 rounded-full transition-colors"
                >
                  <X className="w-5 h-5 text-slate-400" />
                </button>
              </div>
              
              <div className="p-8 space-y-6">
                <div className="space-y-2">
                  <label className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Select Student</label>
                  <select 
                    value={exportStudent}
                    onChange={(e) => setExportStudent(e.target.value)}
                    className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:border-indigo-500 appearance-none transition-all"
                  >
                    <option value="All">All Students</option>
                    {students.map(s => <option key={s.name} value={s.name}>{s.name} ({s.class_period})</option>)}
                  </select>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Start Date</label>
                    <input 
                      type="date"
                      value={exportStartDate}
                      onChange={(e) => setExportStartDate(e.target.value)}
                      className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:border-indigo-500 transition-all"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] font-bold uppercase tracking-widest text-slate-400">End Date</label>
                    <input 
                      type="date"
                      value={exportEndDate}
                      onChange={(e) => setExportEndDate(e.target.value)}
                      className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:border-indigo-500 transition-all"
                    />
                  </div>
                </div>

                <div className="flex flex-wrap gap-2">
                  <button 
                    onClick={setSchoolYearDates}
                    className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-lg text-[10px] font-bold uppercase tracking-widest transition-colors flex items-center gap-2"
                  >
                    <Calendar className="w-3 h-3" />
                    Current School Year
                  </button>
                  <button 
                    onClick={() => { setExportStartDate(''); setExportEndDate(''); }}
                    className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-lg text-[10px] font-bold uppercase tracking-widest transition-colors"
                  >
                    Clear Dates
                  </button>
                </div>
              </div>

              <div className="p-6 border-t border-slate-50 bg-slate-50/50 flex gap-3">
                <button 
                  onClick={() => setShowExportModal(false)}
                  className="flex-1 px-6 py-3 bg-white border border-slate-200 text-slate-600 rounded-xl font-bold hover:bg-slate-50 transition-all"
                >
                  Cancel
                </button>
                <button 
                  onClick={handleExportPDF}
                  className="flex-2 px-6 py-3 bg-indigo-600 text-white rounded-xl font-bold hover:bg-indigo-700 transition-all flex items-center justify-center gap-2 shadow-lg shadow-indigo-200"
                >
                  <Download className="w-4 h-4" />
                  Generate PDF
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showBulkConfirm && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm">
            <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.9 }} className="bg-white w-full max-w-sm rounded-[32px] shadow-2xl overflow-hidden border border-slate-100">
              <div className="p-8 text-center">
                <div className="w-16 h-16 bg-red-50 rounded-full flex items-center justify-center mx-auto mb-6">
                  <Trash2 className="w-8 h-8 text-red-500" />
                </div>
                <h3 className="text-xl font-bold text-slate-900 mb-2">Delete {selectedNoteIds.length} Logs?</h3>
                <p className="text-sm text-slate-500 mb-8">This action cannot be undone. All selected observations will be permanently removed.</p>
                <div className="flex gap-3">
                  <button onClick={() => setShowBulkConfirm(false)} className="flex-1 px-6 py-3 bg-slate-100 text-slate-600 rounded-xl font-bold hover:bg-slate-200 transition-all">Cancel</button>
                  <button onClick={handleDeleteBulk} disabled={isDeletingBulk} className="flex-1 px-6 py-3 bg-red-500 text-white rounded-xl font-bold hover:bg-red-600 transition-all flex items-center justify-center gap-2 shadow-lg shadow-red-200">
                    {isDeletingBulk ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Delete All'}
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
