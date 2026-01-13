'use client';

import React from 'react';
import Card from '@/components/ui-horizon/card';
import { TableRoot, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui-horizon/table';

interface CheckTableRow {
  name: [string, boolean];
  progress: string;
  quantity: number;
  date: string;
}

interface CheckTableProps {
  tableData: CheckTableRow[];
}

/**
 * CheckTable component - Agent Performance Overview table.
 * Matches Horizon CheckTable styling and layout.
 */
export default function CheckTable({ tableData }: CheckTableProps) {
  return (
    <Card extra="w-full h-full sm:overflow-auto px-6">
      {/* Header: flex items-center justify-between pt-4 */}
      <div className="flex items-center justify-between pt-4">
        <h3 className="text-lg font-bold text-navy-700 dark:text-white">
          Agent Performance Overview
        </h3>
      </div>
      
      {/* Table wrapper: mt-8 overflow-x-scroll xl:overflow-x-hidden */}
      <div className="mt-8 overflow-x-scroll xl:overflow-x-hidden">
        <TableRoot>
          <TableHeader>
            <TableRow>
              <TableHead>Agent</TableHead>
              <TableHead>Answer Rate</TableHead>
              <TableHead>Calls Handled</TableHead>
              <TableHead>Last Active</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {tableData.map((row, idx) => (
              <TableRow key={idx}>
                <TableCell className="font-medium">{row.name[0]}</TableCell>
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
