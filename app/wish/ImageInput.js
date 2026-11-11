'use client';
import { useRef, useState } from 'react';
import { browserClient } from '@/lib/supabase-browser';

// Shrinks a photo to at most 1800px on its long side as JPEG, so phone photos upload quickly
export async function shrink(file) {
  if (!file.type.startsWith('image/') || file.type === 'image/gif') return file;
  try {
    const bmp = await createImageBitmap(file);
    const scale = Math.min(1, 1800 / Math.max(bmp.width, bmp.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(bmp.width * scale); canvas.height = Math.round(bmp.height * scale);
    canvas.getContext('2d').drawImage(bmp, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise((r) => canvas.toBlob(r, 'image/jpeg', 0.86));
    return blob || file;
  } catch { return file; }
}

// Uploads straight to your private storage folder and puts the stored path in a hidden field
export default function ImageInput({ userId, name = 'image_path', label = 'Image (optional)', currentUrl = null, required = false }) {
  const [preview, setPreview] = useState(currentUrl);
  const [path, setPath] = useState('');
  const [state, setState] = useState('idle');
  const fileRef = useRef(null);

  const onPick = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const buttons = [...(e.target.form?.querySelectorAll('button[type=submit]') || [])];
    buttons.forEach((b) => { b.disabled = true; });
    setState('uploading');
    try {
      const blob = await shrink(file);
      const ext = blob.type === 'image/gif' ? 'gif' : blob.type === 'image/png' ? 'png' : blob.type === 'image/webp' ? 'webp' : 'jpg';
      const p = `${userId}/${crypto.randomUUID()}.${ext}`;
      const { error } = await browserClient().storage.from('wish').upload(p, blob, { contentType: blob.type || 'image/jpeg', upsert: false });
      if (error) throw error;
      setPath(p); setPreview(URL.createObjectURL(blob)); setState('done');
    } catch {
      setState('error');
      if (fileRef.current) fileRef.current.value = '';
    } finally {
      buttons.forEach((b) => { b.disabled = false; });
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <label>
        {label}
        <input ref={fileRef} type="file" accept="image/*" onChange={onPick} required={required && !path} />
      </label>
      <input type="hidden" name={name} value={path} />
      {state === 'uploading' && <span className="muted" style={{ fontSize: 12 }} aria-live="polite">Uploading…</span>}
      {state === 'error' && <span className="neg" style={{ fontSize: 12 }} role="alert">Upload failed. Try a JPG or PNG under 10 MB.</span>}
      {preview && <img src={preview} alt="" style={{ maxWidth: 220, maxHeight: 160, objectFit: 'cover', borderRadius: 12, border: '1px solid var(--line)' }} />}
    </div>
  );
}
