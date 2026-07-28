import Link from 'next/link';
import type { RoomCard as RoomCardData } from '@/lib/types';

export function RoomCard({ room }: { room: RoomCardData }) {
  return (
    <Link href={`/sala/${room.id}`} className="glass glass-hover p-5 block transition-colors">
      <h3 className="font-semibold text-lg">{room.name}</h3>
      {room.description && (
        <p className="text-sm mt-1 line-clamp-2" style={{ color: 'var(--text-dim)' }}>
          {room.description}
        </p>
      )}
      <p className="text-xs mt-4" style={{ color: 'var(--text-dim)' }}>
        {room.credential_count} senha{room.credential_count === 1 ? '' : 's'} ·{' '}
        {room.member_count} membro{room.member_count === 1 ? '' : 's'}
      </p>
    </Link>
  );
}

export function PersonalCard({ count }: { count: number }) {
  return (
    <Link href="/sala/minhas" className="glass glass-hover p-5 block transition-colors">
      <h3 className="font-semibold text-lg">👤 Minhas senhas</h3>
      <p className="text-sm mt-1" style={{ color: 'var(--text-dim)' }}>
        Suas senhas pessoais de todas as salas
      </p>
      <p className="text-xs mt-4" style={{ color: 'var(--text-dim)' }}>
        {count} senha{count === 1 ? '' : 's'}
      </p>
    </Link>
  );
}
