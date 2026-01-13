'use client';

import React from 'react';
import Card from '@/components/ui-horizon/card';
import { TableRoot, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui-horizon/table';
import { CheckCircle2, AlertCircle, XCircle, MoreVertical } from 'lucide-react';

interface AgentPerformanceRow {
  name: [string, boolean];
  progress: string;
  quantity: number;
  date: string;
}

interface AgentPerformanceTableProps {
  tableData: AgentPerformanceRow[];
}

/**
 * AgentPerformanceTable component - Horizon Complex Table design.
 * Columns: Agent, Status (icon), Answer Rate, Calls Handled, Last Active
 */
export default function AgentPerformanceTable({ tableData }: AgentPerformanceTableProps) {
  // Helper function to determine status icon and color based on answer rate
  const getStatusIcon = (progress: string) => {
    // Extract percentage from progress string (e.g., "85.5%" -> 85.5)
    const percentage = parseFloat(progress.replace('%', ''));
    
    if (percentage >= 90) {
      return <CheckCircle2 className="h-5 w-5 text-green-500" />;
    } else if (percentage >= 70) {
      return <AlertCircle className="h-5 w-5 text-orange-500" />;
    } else {
      return <XCircle className="h-5 w-5 text-red-500" />;
    }
  };

  return (
    <Card extra="w-full h-full sm:overflow-auto rounded-[20px] bg-white px-6 py-6 shadow-shadow-100 dark:!bg-navy-800 dark:text-white dark:shadow-none">
      {/* Header */}
      <div className="flex items-center justify-between pt-4">
        <h3 className="text-lg font-bold text-navy-700 dark:text-white">
          Agent Performance Overview
        </h3>
        <button 
          className="flex h-8 w-8 items-center justify-center rounded-lg bg-lightPrimary text-brand-500 hover:bg-lightPrimary/80 dark:bg-navy-700 dark:text-white"
        >
          <MoreVertical className="h-4 w-4" />
        </button>
      </div>
      
      {/* Table wrapper */}
      <div className="mt-8 overflow-x-scroll xl:overflow-x-hidden">
        <TableRoot>
          <TableHeader>
            <TableRow>
              <TableHead className="uppercase tracking-wide">Agent</TableHead>
              <TableHead className="uppercase tracking-wide">Status</TableHead>
              <TableHead className="uppercase tracking-wide">Answer Rate</TableHead>
              <TableHead className="uppercase tracking-wide">Calls Handled</TableHead>
              <TableHead className="uppercase tracking-wide">Last Active</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {tableData.map((row, idx) => (
              <TableRow key={idx}>
                <TableCell className="font-medium">{row.name[0]}</TableCell>
                <TableCell>
                  {getStatusIcon(row.progress)}
                </TableCell>
                <TableCell>{row.progress}</TableCell>
                <TableCell>{row.quantity}</TableCell>
                <TableCell>{row.date}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </TableRoot>
      </div>
    </Card>
  );
}
