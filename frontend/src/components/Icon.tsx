import React from 'react';

interface IconProps {
  name: string;
  className?: string;
  style?: React.CSSProperties;
  size?: number | string;
}

/**
 * Componente para usar Material Icons
 * @example
 * <Icon name="folder" />
 * <Icon name="check_circle" size={24} />
 * <Icon name="search" className="search-icon" />
 */
export default function Icon({ name, className = '', style = {}, size = 20 }: IconProps) {
  return (
    <span
      className={`material-icons ${className}`}
      style={{
        fontSize: typeof size === 'number' ? `${size}px` : size,
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        verticalAlign: 'middle',
        ...style
      }}
    >
      {name}
    </span>
  );
}

