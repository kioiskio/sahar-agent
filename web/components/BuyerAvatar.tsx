import { Avatar } from 'antd';

export default function BuyerAvatar({ seed }: { seed: string }) {
  // A stable identifier keeps a buyer's illustration consistent across routes and locales.
  let hash = 0;
  for (let index = 0; index < seed.length; index++) hash = (Math.imul(hash, 31) + seed.charCodeAt(index)) >>> 0;
  return <Avatar size={40} src={`/images/avatars/buyer-${hash % 12 + 1}.svg`} alt="" />;
}
