export function getConvertedQuantity(recipeQuantity: number, ingredientUnit: string): number {
  if (!ingredientUnit) return recipeQuantity;
  const unit = ingredientUnit.trim().toUpperCase();
  if (unit === 'KG') return recipeQuantity / 1000;
  if (unit === 'LT') return recipeQuantity / 1000;
  return recipeQuantity;
}
