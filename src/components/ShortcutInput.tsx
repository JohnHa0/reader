import React, { useState } from 'react';

export const ShortcutInput = ({ value, onChange }: { value: string, onChange: (val: string) => void }) => {
  const [recording, setRecording] = useState(false);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    e.preventDefault();
    e.stopPropagation();

    if (e.key === 'Escape') {
      setRecording(false);
      return;
    }

    const keys = [];
    if (e.ctrlKey) keys.push('CommandOrControl');
    if (e.altKey) keys.push('Alt');
    if (e.shiftKey) keys.push('Shift');
    if (e.metaKey) keys.push('Super');

    // Ignore if only modifier is pressed
    if (['Control', 'Alt', 'Shift', 'Meta'].includes(e.key)) return;

    // Convert key to proper format
    let key = e.key.toUpperCase();
    if (key === ' ') key = 'Space';

    keys.push(key);
    
    onChange(keys.join('+'));
    setRecording(false);
  };

  return (
    <input
      type="text"
      value={recording ? "按下快捷键... (Esc取消)" : value}
      onFocus={() => setRecording(true)}
      onBlur={() => setRecording(false)}
      onKeyDown={recording ? handleKeyDown : undefined}
      readOnly
      className="border rounded px-2 py-1 mt-1 text-sm bg-white cursor-pointer w-full text-center"
      placeholder="点击录制快捷键"
    />
  );
};
