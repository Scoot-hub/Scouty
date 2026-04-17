import { useTranslation } from 'react-i18next';
import { DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors } from '@dnd-kit/core';
import { SortableContext, sortableKeyboardCoordinates, rectSortingStrategy, useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Card } from '@/components/ui/card';
import { GripVertical, Maximize2, Minimize2 } from 'lucide-react';
import type { CardSize } from '@/lib/scouting-notes';

/* ── Sortable card wrapper ── */
function SortableCard({ id, size, onToggleSize, editMode, children }: {
  id: string; size: CardSize; onToggleSize: () => void; editMode: boolean; children: React.ReactNode;
}) {
  const { t } = useTranslation();
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id, disabled: !editMode });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 50 : undefined,
    opacity: isDragging ? 0.85 : 1,
  };

  return (
    <div ref={setNodeRef} style={style} className={size === 'full' ? 'md:col-span-2' : ''}>
      <Card className={`card-warm h-full transition-all ${isDragging ? 'shadow-lg ring-2 ring-primary/30' : ''} ${editMode ? 'ring-1 ring-primary/20 ring-dashed' : ''}`}>
        {editMode && (
          <div className="flex items-center gap-1 px-4 pt-3 pb-0">
            <button type="button" {...attributes} {...listeners}
              className="cursor-grab active:cursor-grabbing p-1 rounded hover:bg-muted transition-colors text-muted-foreground hover:text-foreground">
              <GripVertical className="w-4 h-4" />
            </button>
            <div className="flex-1" />
            <button type="button" onClick={onToggleSize}
              className="p-1 rounded hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
              title={size === 'half' ? t('profile.full_width') : t('profile.half_width')}>
              {size === 'half' ? <Maximize2 className="w-3.5 h-3.5" /> : <Minimize2 className="w-3.5 h-3.5" />}
            </button>
          </div>
        )}
        {children}
      </Card>
    </div>
  );
}

/* ── Grid with DnD context ── */
interface SortableCardGridProps {
  items: string[];
  sizes: Record<string, CardSize>;
  editMode: boolean;
  onReorder: (activeId: string, overId: string) => void;
  onToggleSize: (cardId: string) => void;
  renderCard: (cardId: string) => React.ReactNode;
}

export default function SortableCardGrid({ items, sizes, editMode, onReorder, onToggleSize, renderCard }: SortableCardGridProps) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={event => {
      const { active, over } = event;
      if (over && active.id !== over.id) {
        onReorder(active.id as string, over.id as string);
      }
    }}>
      <SortableContext items={items} strategy={rectSortingStrategy}>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {items.map(cardId => (
            <SortableCard key={cardId} id={cardId} size={sizes[cardId]} onToggleSize={() => onToggleSize(cardId)} editMode={editMode}>
              {renderCard(cardId)}
            </SortableCard>
          ))}
        </div>
      </SortableContext>
    </DndContext>
  );
}
