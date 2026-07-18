import { useMemo } from 'react';
import { getFittedFontSize } from '../lib/cardRenderer';

export default function CardNamePreview({
  value,
  settings,
  language,
  templateWidth,
  previewScale,
}) {
  const text = value.trim() || settings.sampleText;
  const fittedSize = useMemo(
    () => getFittedFontSize(text, settings, templateWidth),
    [text, settings, templateWidth],
  );

  return (
    <div
      className="public-name-layer"
      dir={language === 'ar' ? 'rtl' : 'ltr'}
      lang={language === 'en' ? 'en' : undefined}
      style={{
        left: `${settings.x * 100}%`,
        top: `${settings.y * 100}%`,
        width: `${settings.maxWidth * 100}%`,
        color: settings.color,
        fontFamily: `'${settings.familyName}', ${language === 'ar' ? 'Arial' : 'sans-serif'}`,
        fontWeight: settings.fontWeight,
        fontStyle: settings.fontStyle,
        fontSize: `${Math.max(8, fittedSize * previewScale)}px`,
        lineHeight: settings.lineHeight,
        letterSpacing: `${settings.letterSpacing * previewScale}px`,
        textAlign: settings.align,
      }}
    >
      {text}
    </div>
  );
}
