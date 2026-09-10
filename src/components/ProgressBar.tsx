export default function ProgressBar({ value }: { value: number }) {
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-zinc-800">
      <div
        className="h-full rounded-full bg-amber-500 transition-all duration-150"
        style={{ width: `${value}%` }}
      />
    </div>
  );
}
