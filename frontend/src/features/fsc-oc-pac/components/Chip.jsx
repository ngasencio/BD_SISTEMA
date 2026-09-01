export default function Chip({ variant = 'none', children }) {
    return (
        <span className={`dv-chip dv-chip--${variant}`}>
            <span className="dv-chip__dot" />
            {children}
        </span>
    );
}
