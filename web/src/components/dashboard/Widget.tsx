'use client';

import React from 'react';
import { Stat } from '@/components/ui-horizon/stat';

interface WidgetProps {
  icon: React.ReactNode;
  title: React.ReactNode;
  subtitle: React.ReactNode;
}

/**
 * Widget component adapter - replaces Horizon Widget with Stat component.
 */
export default function Widget({ icon, title, subtitle }: WidgetProps) {
  // Convert title to string, handling ReactNode with Info icon
  const titleContent = typeof title === 'string' ? title : React.Children.toArray(title).join('');
  return <Stat label={titleContent} value={subtitle} icon={icon} />;
}
