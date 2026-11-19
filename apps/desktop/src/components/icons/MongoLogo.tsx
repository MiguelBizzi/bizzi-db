export function MongoLogo({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden xmlns="http://www.w3.org/2000/svg">
      <path
        fill="#13AA52"
        d="M12 2c3.6 3.4 5.6 6.6 5.6 10.2 0 3.4-2.1 6.1-4.9 7.2V22h-1.4v-2.6c-2.8-1.1-4.9-3.8-4.9-7.2C6.4 8.6 8.4 5.4 12 2z"
      />
      <path fill="#fff" fillOpacity=".55" d="M12 5.2c-1.7 2.1-2.6 4.4-2.6 7 0 2.4.9 4.4 2.6 5.8V5.2z" />
    </svg>
  );
}
