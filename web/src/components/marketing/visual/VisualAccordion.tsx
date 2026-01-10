'use client';

import { useState } from 'react';
import { ChevronDown, ChevronUp, LucideIcon } from 'lucide-react';

interface AccordionItem {
  icon: LucideIcon;
  title: string;
  answer: React.ReactNode;
  visual?: React.ReactNode;
}

interface VisualAccordionProps {
  items: AccordionItem[];
}

export function VisualAccordion({ items }: VisualAccordionProps) {
  const [openIndex, setOpenIndex] = useState<number | null>(null);

  const toggleItem = (index: number) => {
    setOpenIndex(openIndex === index ? null : index);
  };

  return (
    <div className="space-y-3">
      {items.map((item, index) => {
        const Icon = item.icon;
        const isOpen = openIndex === index;

        return (
          <div
            key={index}
            className="rounded-2xl border border-[#CBD5E1] bg-white overflow-hidden transition-all"
          >
            <button
              onClick={() => toggleItem(index)}
              className="w-full px-6 py-4 flex items-center justify-between text-left hover:bg-[#F1F5F9] transition-colors"
              aria-expanded={isOpen}
            >
              <div className="flex items-center gap-3">
                <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-[#F1F5F9]">
                  <Icon className="h-4 w-4 text-[#2563EB]" />
                </div>
                <h3 className="text-base font-bold text-[#0F172A]">
                  {item.title}
                </h3>
              </div>
              <div className="flex-shrink-0">
                {isOpen ? (
                  <ChevronUp className="h-5 w-5 text-[#64748B]" />
                ) : (
                  <ChevronDown className="h-5 w-5 text-[#64748B]" />
                )}
              </div>
            </button>
            <div
              className={`overflow-hidden transition-all duration-300 ease-in-out ${
                isOpen ? 'max-h-[1000px] opacity-100' : 'max-h-0 opacity-0'
              }`}
            >
              <div className="px-6 pb-4 md:flex md:gap-6">
                <div className="flex-1">
                  <div className="text-sm text-[#475569] leading-relaxed pt-2">
                    {item.answer}
                  </div>
                </div>
                {item.visual && (
                  <div className="hidden md:block flex-shrink-0 w-48 mt-2">
                    {item.visual}
                  </div>
                )}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
