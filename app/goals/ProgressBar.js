export default function ProgressBar({ value, label }) {
  return (
    <div className="track" role="progressbar" aria-valuenow={value} aria-valuemin={0} aria-valuemax={100} aria-label={label || 'Progress'}>
      <div className="bar" style={{ width: `${value}%` }} />
    </div>
  );
}
