import Image from "next/image";

type BrandLogoProps = {
  className?: string;
  priority?: boolean;
  withWordmark?: boolean;
};

export default function BrandLogo({ className, priority = false, withWordmark = true }: BrandLogoProps) {
  return (
    <div className={className}>
      <Image
        src="/brand/ahwa-logo.svg"
        alt={withWordmark ? "Ahwa logo" : "Ahwa mark"}
        width={withWordmark ? 320 : 120}
        height={withWordmark ? 192 : 120}
        priority={priority}
        className="h-auto w-full object-contain"
      />
    </div>
  );
}
