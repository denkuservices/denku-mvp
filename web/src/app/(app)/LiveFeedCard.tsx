import React from "react";

interface FeedItem {
  id: number;
  message: string;
  time: string;
}

export function LiveFeedCard({ feed }: { feed: FeedItem[] }) {
  return (
    <div className="rounded-xl border bg-white p-5 shadow-sm h-full">
      <h3 className="font-semibold mb-4">Live Feed</h3>
      <div className="space-y-4">
        {feed.map((item) => (
          <div key={item.id} className="flex gap-3 items-start text-sm">
            <div className="mt-1.5 h-1.5 w-1.5 rounded-full bg-blue-500 shrink-0" />
            <div className="flex-1">
              <p className="text-gray-900">{item.message}</p>
              <p className="text-xs text-muted-foreground mt-0.5">{item.time}</p>
            </div>
          </div>
        ))}
        {feed.length === 0 && (
          <div className="text-sm text-muted-foreground">No recent activity.</div>
        )}
      </div>
    </div>
  );
}