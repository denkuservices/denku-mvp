'use client';

import React from 'react';
import { Card } from '@/components/ui-horizon/card';
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
 * Minimal replacement for Horizon CheckTable.
 */
export default function CheckTable({ tableData }: CheckTableProps) {
  return (
    <Card className="p-6">
      <h3 className="mb-4 text-lg font-bold text-navy-700 dark:text-white">
        Agent Performance Overview
      </h3>
      <div className="overflow-x-auto">
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
