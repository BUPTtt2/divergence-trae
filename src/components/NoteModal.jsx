import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { getCardNotes, addCardNote, deleteCardNote } from '../services/apiClient';

const T = {
  paper: '#F2EDE0',
  paperLight: '#FAF6EC',
  ink: '#1A1410',
  inkSoft: '#2A2A33',
  muted: '#7A7468',
  border: '#D9D2C0',
  accent: '#A8472E',
  accentBright: '#C4623A',
  gold: '#C8A850',
  goldLight: '#F0D890',
};

const EASE = [0.16, 1, 0.3, 1];

export default function NoteModal({ card, isOpen, onClose }) {
  const [notes, setNotes] = useState([]);
  const [newNote, setNewNote] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const loadNotes = useCallback(async () => {
    if (!card?.id) return;
    setIsLoading(true);
    try {
      const data = await getCardNotes(card.id);
      if (data && data.notes) {
        setNotes(data.notes.sort((a, b) => new Date(b.createdAt || b.date) - new Date(a.createdAt || a.date)));
      }
    } catch (e) {
      console.warn('[NoteModal] 加载笔记失败，尝试本地存储:', e.message);
      try {
        const localNotes = JSON.parse(localStorage.getItem(`yance_notes_${card.id}`) || '[]');
        setNotes(localNotes.sort((a, b) => new Date(b.createdAt || b.date) - new Date(a.createdAt || a.date)));
      } catch (e2) { /* ignore */ }
    } finally {
      setIsLoading(false);
    }
  }, [card?.id]);

  useEffect(() => {
    if (isOpen && card?.id) {
      loadNotes();
    }
  }, [isOpen, card?.id, loadNotes]);

  const handleAddNote = useCallback(async () => {
    if (!newNote.trim() || !card?.id) return;
    setIsSaving(true);
    const noteContent = newNote.trim();
    const tempNote = {
      id: `note-${Date.now()}`,
      content: noteContent,
      createdAt: new Date().toISOString(),
    };

    setNotes(prev => [tempNote, ...prev]);
    setNewNote('');

    try {
      await addCardNote(card.id, noteContent);
    } catch (e) {
      console.warn('[NoteModal] 保存笔记到后端失败，保存到本地:', e.message);
      try {
        const localNotes = JSON.parse(localStorage.getItem(`yance_notes_${card.id}`) || '[]');
        localNotes.unshift(tempNote);
        localStorage.setItem(`yance_notes_${card.id}`, JSON.stringify(localNotes));
      } catch (e2) { /* ignore */ }
    } finally {
      setIsSaving(false);
    }
  }, [newNote, card?.id]);

  const handleDeleteNote = useCallback(async (noteId) => {
    if (!card?.id) return;
    setNotes(prev => prev.filter(n => n.id !== noteId));
    try {
      await deleteCardNote(card.id, noteId);
    } catch (e) {
      console.warn('[NoteModal] 删除笔记失败，本地删除:', e.message);
      try {
        const localNotes = JSON.parse(localStorage.getItem(`yance_notes_${card.id}`) || '[]');
        const filtered = localNotes.filter(n => n.id !== noteId);
        localStorage.setItem(`yance_notes_${card.id}`, JSON.stringify(filtered));
      } catch (e2) { /* ignore */ }
    }
  }, [card?.id]);

  const formatDate = (dateStr) => {
    if (!dateStr) return '';
    const date = new Date(dateStr);
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    return `${year}.${month}.${day} ${hours}:${minutes}`;
  };

  if (!isOpen || !card) return null;

  return (
    <AnimatePresence>
      <motion.div
        className="fixed inset-0 z-50 flex items-center justify-center p-4"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.3 }}
      >
        <motion.div
          className="absolute inset-0"
          style={{ backgroundColor: 'rgba(10, 8, 6, 0.88)', backdropFilter: 'blur(12px)' }}
          onClick={onClose}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        />

        <motion.div
          className="relative w-full max-w-lg"
          initial={{ opacity: 0, scale: 0.9, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.9, y: 20 }}
          transition={{ duration: 0.4, ease: EASE }}
          style={{
            background: `linear-gradient(180deg, ${T.paper} 0%, ${T.paperLight} 100%)`,
            border: `2px solid ${T.gold}`,
            borderRadius: '6px',
            boxShadow: `0 0 60px ${T.gold}30, 0 20px 60px rgba(0,0,0,0.5)`,
            maxHeight: '80vh',
            display: 'flex',
            flexDirection: 'column',
          }}
        >
          <div
            className="px-6 py-4 flex items-center justify-between"
            style={{
              borderBottom: `1px solid ${T.border}`,
              background: `${T.gold}08`,
            }}
          >
            <div className="flex items-center gap-3">
              <span style={{ color: T.gold, fontSize: '24px' }}>{card.trigram || '☯'}</span>
              <div>
                <h3
                  className="font-serif font-bold"
                  style={{ color: T.ink, fontSize: '18px', letterSpacing: '0.1em' }}
                >
                  {card.gua || '命运卡'} · 心得笔记
                </h3>
                <p style={{ color: T.muted, fontSize: '11px', fontFamily: 'monospace' }}>
                  {card.title || card.question || ''}
                </p>
              </div>
            </div>
            <button
              onClick={onClose}
              style={{
                color: T.muted,
                fontSize: '24px',
                cursor: 'pointer',
                background: 'transparent',
                border: 'none',
                padding: '4px 8px',
                lineHeight: 1,
              }}
            >
              ×
            </button>
          </div>

          <div className="px-6 py-4" style={{ borderBottom: `1px dashed ${T.border}` }}>
            <div className="flex gap-2">
              <textarea
                value={newNote}
                onChange={(e) => setNewNote(e.target.value)}
                placeholder="写下你的心得感悟..."
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                    e.preventDefault();
                    handleAddNote();
                  }
                }}
                style={{
                  flex: 1,
                  padding: '10px 12px',
                  background: 'rgba(255,255,255,0.6)',
                  border: `1px solid ${T.border}`,
                  color: T.ink,
                  fontSize: '13px',
                  fontFamily: '"Noto Serif SC", serif',
                  borderRadius: '3px',
                  outline: 'none',
                  resize: 'vertical',
                  minHeight: '60px',
                  lineHeight: 1.7,
                }}
              />
              <motion.button
                whileHover={{ scale: 1.02, y: -1 }}
                whileTap={{ scale: 0.98 }}
                onClick={handleAddNote}
                disabled={isSaving || !newNote.trim()}
                style={{
                  padding: '0 20px',
                  background: T.accent,
                  color: T.paperLight,
                  border: 'none',
                  borderRadius: '3px',
                  fontSize: '12px',
                  fontFamily: '"Ma Shan Zheng", serif',
                  letterSpacing: '0.15em',
                  cursor: newNote.trim() ? 'pointer' : 'not-allowed',
                  opacity: newNote.trim() ? 1 : 0.5,
                  alignSelf: 'flex-start',
                  height: '40px',
                }}
              >
                {isSaving ? '保存中' : '记一笔'}
              </motion.button>
            </div>
            <div style={{ marginTop: '6px', color: T.muted, fontSize: '10px', fontFamily: 'monospace' }}>
              Ctrl/Cmd + Enter 快速保存
            </div>
          </div>

          <div
            className="flex-1 overflow-y-auto px-6 py-4"
            style={{ scrollbarWidth: 'thin', scrollbarColor: `${T.gold}40 transparent` }}
          >
            {isLoading ? (
              <div className="text-center py-8" style={{ color: T.muted }}>
                <motion.div
                  animate={{ rotate: 360 }}
                  transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
                  style={{ fontSize: '24px', marginBottom: '8px' }}
                >
                  ☯
                </motion.div>
                <span style={{ fontSize: '12px' }}>加载笔记中...</span>
              </div>
            ) : notes.length === 0 ? (
              <div className="text-center py-12">
                <div style={{ fontSize: '48px', opacity: 0.3, marginBottom: '12px' }}>📝</div>
                <p style={{ color: T.muted, fontSize: '13px' }}>暂无笔记</p>
                <p style={{ color: T.muted, fontSize: '11px', marginTop: '4px' }}>
                  记下此刻的感悟，留作他日之镜
                </p>
              </div>
            ) : (
              <div className="space-y-4">
                {notes.map((note, index) => (
                  <motion.div
                    key={note.id || index}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: index * 0.05, duration: 0.3 }}
                    className="relative group"
                    style={{
                      padding: '14px 16px',
                      background: 'rgba(255,255,255,0.5)',
                      border: `1px solid ${T.border}`,
                      borderRadius: '4px',
                      position: 'relative',
                    }}
                  >
                    <div
                      className="absolute top-0 left-4"
                      style={{
                        width: '20px',
                        height: '3px',
                        background: T.gold,
                        transform: 'translateY(-1px)',
                      }}
                    />
                    <div
                      className="flex items-start justify-between gap-3 mb-2"
                    >
                      <span
                        style={{
                          color: T.muted,
                          fontSize: '11px',
                          fontFamily: 'monospace',
                        }}
                      >
                        {formatDate(note.createdAt || note.date)}
                      </span>
                      <button
                        onClick={() => handleDeleteNote(note.id)}
                        style={{
                          color: T.muted,
                          fontSize: '12px',
                          cursor: 'pointer',
                          background: 'transparent',
                          border: 'none',
                          padding: '2px 6px',
                          opacity: 0,
                          transition: 'opacity 0.2s',
                        }}
                        onMouseEnter={(e) => (e.currentTarget.style.opacity = '1')}
                        onMouseLeave={(e) => (e.currentTarget.style.opacity = '0')}
                        className="group-hover:opacity-100"
                      >
                        删除
                      </button>
                    </div>
                    <p
                      style={{
                        color: T.ink,
                        fontSize: '13px',
                        lineHeight: 1.8,
                        fontFamily: '"Noto Serif SC", serif',
                        whiteSpace: 'pre-wrap',
                        wordBreak: 'break-word',
                      }}
                    >
                      {note.content}
                    </p>
                  </motion.div>
                ))}
              </div>
            )}
          </div>

          <div
            className="px-6 py-3 text-center"
            style={{
              borderTop: `1px solid ${T.border}`,
              background: `${T.gold}05`,
            }}
          >
            <span style={{ color: T.muted, fontSize: '11px', fontFamily: 'monospace' }}>
              共 {notes.length} 条笔记 · 点滴记录，皆是心路
            </span>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
