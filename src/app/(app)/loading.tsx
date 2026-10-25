export default function Loading() {
  return (
    <div className="animate-pulse space-y-6" role="status" aria-label="Loading">
      <div className="h-8 w-64 rounded-md bg-slate-200" />
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">{[0, 1, 2, 3].map((i) => <div key={i} className="h-24 rounded-xl bg-slate-200" />)}</div>
      <div className="grid gap-4 lg:grid-cols-3"><div className="h-72 rounded-xl bg-slate-200 lg:col-span-2" /><div className="h-72 rounded-xl bg-slate-200" /></div>
    </div>
  );
}
