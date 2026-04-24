import { Helmet } from 'react-helmet-async';

interface PageSEOProps {
  title: string;
  description: string;
  path?: string;
  noIndex?: boolean;
}

const SITE_NAME = 'Scouty';
const BASE_URL = 'https://scouty.app';
const DEFAULT_IMAGE = `${BASE_URL}/og-image.png`;

export default function PageSEO({ title, description, path = '', noIndex = false }: PageSEOProps) {
  const fullTitle = title.includes(SITE_NAME) ? title : `${title} | ${SITE_NAME}`;
  const canonical = `${BASE_URL}${path}`;

  return (
    <Helmet>
      <title>{fullTitle}</title>
      <meta name="description" content={description} />
      <link rel="canonical" href={canonical} />
      {noIndex && <meta name="robots" content="noindex, nofollow" />}

      {/* Open Graph */}
      <meta property="og:site_name" content={SITE_NAME} />
      <meta property="og:title" content={fullTitle} />
      <meta property="og:description" content={description} />
      <meta property="og:url" content={canonical} />
      <meta property="og:type" content="website" />
      <meta property="og:image" content={DEFAULT_IMAGE} />
      <meta property="og:locale" content="fr_FR" />

      {/* Twitter Card */}
      <meta name="twitter:card" content="summary_large_image" />
      <meta name="twitter:title" content={fullTitle} />
      <meta name="twitter:description" content={description} />
      <meta name="twitter:image" content={DEFAULT_IMAGE} />
    </Helmet>
  );
}
