'use client';

import { useState } from 'react';
import { HiChevronDown, HiChevronUp } from 'react-icons/hi';

interface AuditMetadataRow {
  field: string;
  value: string | React.ReactNode;
}

interface CollapsibleAuditMetadataProps {
  rows: AuditMetadataRow[];
}

export function CollapsibleAuditMetadata({ rows }: CollapsibleAuditMetadataProps) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div className="!z-5 relative flex flex-col rounded-[20px] bg-white bg-clip-border shadow-shadow-100 dark:!bg-navy-800 dark:text-white dark:shadow-none">
      <div className={`flex items-center justify-between px-6 pt-6 ${!isOpen ? 'pb-6' : ''}`}>
        <h2 className="font-dm text-lg font-bold text-navy-700 dark:text-white">Audit & Metadata</h2>
        <button
          onClick={() => setIsOpen(!isOpen)}
          className="flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 transition-colors hover:bg-gray-50 dark:border-gray-600 dark:bg-navy-700 dark:text-white dark:hover:bg-navy-600"
          aria-expanded={isOpen}
        >
          {isOpen ? (
            <>
              <span>Hide</span>
              <HiChevronUp className="h-4 w-4" />
            </>
          ) : (
            <>
              <span>Show</span>
              <HiChevronDown className="h-4 w-4" />
            </>
          )}
        </button>
      </div>
      {isOpen && (
        <div className="mt-4 overflow-x-auto px-6 pb-6">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 dark:border-white/20">
                <th className="px-4 py-3 text-left text-xs font-bold text-gray-600 dark:text-white">Field</th>
                <th className="px-4 py-3 text-left text-xs font-bold text-gray-600 dark:text-white">Value</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 dark:divide-white/10">
              {rows.map((row, index) => (
                <tr key={index} className="hover:bg-gray-50 dark:hover:bg-navy-700/50">
                  <td className="px-4 py-3 text-sm font-medium text-gray-600 dark:text-gray-400">{row.field}</td>
                  <td className="px-4 py-3 text-sm font-bold text-navy-700 dark:text-white">{row.value}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
