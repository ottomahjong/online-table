import React, { useRef, useCallback } from 'react';
import { useDrag, useDrop } from 'react-dnd';

const HAND_TILE_TYPE = 'HAND_TILE';

interface DragItem {
  index: number;
  id: string;
}

interface DraggableHandTileProps {
  index: number;
  tileId: string;
  moveTile: (fromIndex: number, toIndex: number) => void;
  onClick: () => void;
  children: React.ReactNode;
  disabled?: boolean;
}

export function DraggableHandTile({
  index,
  tileId,
  moveTile,
  onClick,
  children,
  disabled = false,
}: DraggableHandTileProps) {
  const ref = useRef<HTMLDivElement>(null);

  // Track whether a drag actually happened so we can suppress onClick after drop
  const didDragRef = useRef(false);

  const [{ isDragging }, drag] = useDrag({
    type: HAND_TILE_TYPE,
    item: () => {
      didDragRef.current = false;
      return { index, id: tileId };
    },
    canDrag: !disabled,
    collect: (monitor) => ({
      isDragging: monitor.isDragging(),
    }),
    end: () => {
      // Mark that a drag occurred (even if dropped in place)
      // We check didDragRef in the click handler below
    },
  });

  const [{ isOver, isOverCurrent }, drop] = useDrop<DragItem, void, { isOver: boolean; isOverCurrent: boolean }>({
    accept: HAND_TILE_TYPE,
    hover(item, monitor) {
      if (!ref.current) return;
      const dragIndex = item.index;
      const hoverIndex = index;

      if (dragIndex === hoverIndex) return;

      // Get the bounding rect of the hovered tile
      const hoverRect = ref.current.getBoundingClientRect();
      // Get the horizontal center
      const hoverMiddleX = (hoverRect.right - hoverRect.left) / 2;
      // Get mouse position
      const clientOffset = monitor.getClientOffset();
      if (!clientOffset) return;
      // Get pixels from the left edge of the hovered tile
      const hoverClientX = clientOffset.x - hoverRect.left;

      // Only move when the mouse crosses the center threshold
      // Dragging right: only move when cursor passes center of next tile
      if (dragIndex < hoverIndex && hoverClientX < hoverMiddleX) return;
      // Dragging left: only move when cursor passes center of previous tile
      if (dragIndex > hoverIndex && hoverClientX > hoverMiddleX) return;

      didDragRef.current = true;
      moveTile(dragIndex, hoverIndex);
      // Mutate the item's index to reflect its new position
      item.index = hoverIndex;
    },
    collect: (monitor) => ({
      isOver: monitor.isOver(),
      isOverCurrent: monitor.isOver({ shallow: true }),
    }),
  });

  // Combine drag and drop refs
  drag(drop(ref));

  const handleClick = useCallback(() => {
    // If a drag just happened, don't trigger click
    if (didDragRef.current) {
      didDragRef.current = false;
      return;
    }
    onClick();
  }, [onClick]);

  return (
    <div
      ref={ref}
      className="relative"
      onClick={handleClick}
      style={{
        opacity: isDragging ? 0.35 : 1,
        cursor: disabled ? undefined : 'grab',
        transition: isDragging ? 'none' : 'opacity 0.15s ease',
      }}
    >
      {/* Drop indicator line */}
      {isOverCurrent && !isDragging && (
        <div
          className="absolute top-0 bottom-0 w-0.5 rounded-full z-20"
          style={{
            left: -2,
            background: '#B5704F',
            boxShadow: '0 0 6px rgba(181,112,79,0.6)',
          }}
        />
      )}
      {children}
    </div>
  );
}
