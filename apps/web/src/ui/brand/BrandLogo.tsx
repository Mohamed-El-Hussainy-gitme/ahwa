import Image from 'next/image';

type BrandLogoProps = {
  className?: string;
  priority?: boolean;
  withWordmark?: boolean;
};

export default function BrandLogo({ className, priority = false, withWordmark = true }: BrandLogoProps) {
  return (
    <div className={className}>
      <Image
        src={withWordmark ? '/brand/ahwa-login-logo.webp' : '/brand/ahwa-mark.webp'}
        alt={withWordmark ? 'Ahwa brand' : 'Ahwa mark'}
        width={withWordmark ? 900 : 512}
        height={withWordmark ? 320 : 512}
        priority={priority}
        className='h-auto w-full object-contain'
      />
    </div>
  );
}
