export const MATCH_ORDER_STRINGS = {
  'matchOrder.matchNotFound': 'No se encontró el partido que querés mover.',
  'matchOrder.matchNotPending': 'Solo podés mover partidos pendientes.',
  'matchOrder.matchNotReorderable': 'Este partido no se puede reordenar.',
  'matchOrder.matchAtBoundary': 'El partido ya está en el límite del orden.',
  'matchOrder.lockedMatch': 'No podés mover un partido antes de uno que ya empezó o terminó.',
  'matchOrder.dependencyWouldBeBroken':
    'Ese orden pondría un cruce antes del partido del que depende.',
  'matchOrder.invalidSuggestedOrder': 'No se pudo restablecer el orden sugerido.',
  'matchOrder.duplicateOrder': 'El fixture tiene posiciones de orden repetidas.',
} as const;
