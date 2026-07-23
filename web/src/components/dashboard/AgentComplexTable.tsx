'use client';

import React from "react";
import Card from '@/components/ui-horizon/card';

import {
  createColumnHelper,
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  SortingState,
  useReactTable,
} from "@tanstack/react-table";

type RowObj = {
  agent: string;
  status: 'Healthy' | 'Attention' | 'Low';
  calls: string; // "93 / 104" format
  lastActive: string; // "12 Jan 2026" format
  answerRate: number; // 0-100
  callsHandled: number;
  callsTotal: number;
};

const columnHelper = createColumnHelper<RowObj>();

export default function AgentComplexTable(props: { tableData: any }) {
  const { tableData } = props;
  const [sorting, setSorting] = React.useState<SortingState>([]);
  let defaultData = tableData;
  
  const columns = [
    columnHelper.accessor("agent", {
      id: "agent",
      header: () => (
        <p className="text-sm font-bold text-gray-600 dark:text-white tracking-wider">AGENT</p>
      ),
      cell: (info) => (
        <p className="text-sm font-semibold text-navy-700 dark:text-white">
          {info.getValue()}
        </p>
      ),
    }),
    columnHelper.accessor("status", {
      id: "status",
      header: () => (
        <div className="flex items-center justify-center">
          <span className="text-sm font-bold text-gray-600 dark:text-white tracking-wider">STATUS</span>
        </div>
      ),
      cell: (info) => {
        const status = info.getValue();
        const styles =
          status === "Healthy"
            ? "bg-green-50 text-green-700 dark:bg-green-500/10 dark:text-green-300"
            : status === "Attention"
            ? "bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-300"
            : "bg-gray-100 text-gray-600 dark:bg-navy-700 dark:text-gray-300";
        return (
          <div className="flex items-center justify-center">
            <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${styles}`}>
              {status}
            </span>
          </div>
        );
      },
    }),
    columnHelper.accessor("calls", {
      id: "calls",
      header: () => (
        <p className="text-sm font-bold text-gray-600 dark:text-white tracking-wider text-center">CALLS</p>
      ),
      cell: (info) => (
        <p className="text-sm font-medium text-navy-700 dark:text-white text-center tabular-nums">
          {info.getValue()}
        </p>
      ),
    }),
    columnHelper.accessor("lastActive", {
      id: "lastActive",
      header: () => (
        <p className="text-sm font-bold text-gray-600 dark:text-white tracking-wider">LAST ACTIVE</p>
      ),
      cell: (info) => (
        <p className="text-sm font-bold text-navy-700 dark:text-white whitespace-nowrap">
          {info.getValue()}
        </p>
      ),
    }),
    columnHelper.accessor("answerRate", {
      id: "answerRate",
      header: () => (
        <p className="text-sm font-bold text-gray-600 dark:text-white tracking-wider">
          ANSWER RATE
        </p>
      ),
      cell: (info) => {
        const rate = info.getValue();
        const pct = Math.max(0, Math.min(100, Number(rate ?? 0)));
        const progressBgColor = pct >= 90 
          ? "bg-brand-500 dark:bg-brand-400" 
          : pct >= 70 
          ? "bg-brand-300 dark:bg-brand-400" 
          : "bg-gray-300 dark:bg-gray-400";
        
        return (
          <div className="flex flex-col">
            <span className="text-sm font-semibold text-navy-700 dark:text-white text-center mb-1">
              {pct.toFixed(1)}%
            </span>
            <div className="w-[120px] h-2.5 rounded-full bg-gray-200/70 dark:bg-navy-700 overflow-hidden">
              <div
                className={`h-full rounded-full ${progressBgColor}`}
                style={{ width: `${pct}%` }}
              />
            </div>
          </div>
        );
      },
    }),
  ];
  
  const [data, setData] = React.useState(() => [...defaultData]);
  const table = useReactTable({
    data,
    columns,
    state: {
      sorting,
    },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    debugTable: true,
  });
  
  return (
    <Card extra={"w-full h-full p-4 sm:p-6"}>
      <div className="pt-4 pb-2">
        <div className="text-xl font-bold text-navy-700 dark:text-white">
          Agent Performance
        </div>
      </div>

      <div className="mt-6 overflow-x-auto">
        <table className="w-full table-fixed">
          <colgroup>
            <col className="w-[28%]" />
            <col className="w-[16%]" />
            <col className="w-[14%]" />
            <col className="w-[18%]" />
            <col className="w-[24%]" />
          </colgroup>
          <thead>
            {table.getHeaderGroups().map((headerGroup) => (
              <tr key={headerGroup.id}>
                {headerGroup.headers.map((header) => {
                  return (
                    <th
                      key={header.id}
                      colSpan={header.colSpan}
                      onClick={header.column.getToggleSortingHandler()}
                      className="cursor-pointer pt-4 pb-3 px-2 text-start"
                    >
                      {flexRender(
                        header.column.columnDef.header,
                        header.getContext()
                      )}
                    </th>
                  );
                })}
              </tr>
            ))}
          </thead>
          <tbody>
            {table
              .getRowModel()
              .rows.slice(0, 5)
              .map((row) => {
                return (
                  <tr key={row.id}>
                    {row.getVisibleCells().map((cell) => {
                      return (
                        <td
                          key={cell.id}
                          className="py-3 px-2 align-middle border-b border-gray-200/60"
                        >
                          {flexRender(
                            cell.column.columnDef.cell,
                            cell.getContext()
                          )}
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
