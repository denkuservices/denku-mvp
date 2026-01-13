'use client';

import React from 'react';

interface DropdownProps {
  button: React.ReactNode;
  animation?: string;
  classNames?: string;
  children: React.ReactNode;
}

function Dropdown({ button, animation = '', classNames = '', children }: DropdownProps) {
  const [open, setOpen] = React.useState(false);
  const ref = React.useRef<HTMLDivElement | null>(null);

  React.useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (!ref.current) return;
      if (ref.current.contains(e.target as Node)) return;
      setOpen(false);
    }
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, []);

  return (
    <div className="relative" ref={ref}>
      <div onClick={() => setOpen(!open)}>{button}</div>
      {open && (
        <div className={`absolute z-50 ${animation} ${classNames}`}>
          {children}
        </div>
      )}
    </div>
  );
}

export default Dropdown;
