import { Image } from 'antd';
import { HomeOutlined } from '@ant-design/icons';

const photos: Record<string, string> = {
  'marina-sky': 'marina-sky',
  'demo-listing-marina': 'marina-sky',
  'palm-lagoon': 'palm-lagoon',
  'demo-listing-palm': 'palm-lagoon',
  'downtown-crest': 'downtown-crest',
  'demo-listing-downtown': 'downtown-crest'
};

export default function ListingCover({ id, title, area }: { id: string; title: string; area: string }) {
  const photo = photos[id];
  return photo
    ? <div className="property-photo-cover"><Image src={`/images/listings/${photo}.webp`} alt={`${title} · ${area}`} width="100%" height="100%" style={{ objectFit: 'cover', display: 'block' }} preview={false} loading="lazy" decoding="async" /></div>
    : <div className="property-cover" role="img" aria-label={area}><HomeOutlined /></div>;
}
