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
        alt={withWordmark ? "Ahwa brand" : "Ahwa mark"}
        width={withWordmark ? 360 : 132}
        height={withWordmark ? 120 : 132}
        priority={priority}
        className="h-auto w-full object-contain"
      />
    </div>
  );
}
