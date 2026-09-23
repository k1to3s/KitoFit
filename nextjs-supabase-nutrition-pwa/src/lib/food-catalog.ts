export type CatalogFood = {
  id: string;
  name: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
};

// Approximate nutrition per 100 g. Recipes vary enormously; these are editable
// starting points, NOT nutrition facts inferred by the image classifier.
// Labels are the exact 101 classes in the Food-101 model's config.json.
const food101Rows: [string, number, number, number, number][] = [
  ["apple_pie", 237, 2, 34, 11],
  ["baby_back_ribs", 290, 20, 6, 21],
  ["baklava", 428, 6, 45, 26],
  ["beef_carpaccio", 165, 21, 1, 9],
  ["beef_tartare", 190, 19, 2, 12],
  ["beet_salad", 110, 3, 13, 6],
  ["beignets", 355, 5, 43, 18],
  ["bibimbap", 140, 7, 21, 4],
  ["bread_pudding", 180, 5, 26, 6],
  ["breakfast_burrito", 210, 10, 22, 10],
  ["bruschetta", 220, 5, 27, 10],
  ["caesar_salad", 190, 8, 7, 15],
  ["cannoli", 310, 7, 35, 16],
  ["caprese_salad", 170, 10, 3, 13],
  ["carrot_cake", 390, 4, 49, 20],
  ["ceviche", 95, 14, 5, 2],
  ["cheesecake", 320, 6, 26, 22],
  ["cheese_plate", 350, 23, 4, 27],
  ["chicken_curry", 165, 12, 8, 10],
  ["chicken_quesadilla", 250, 14, 20, 13],
  ["chicken_wings", 250, 22, 7, 16],
  ["chocolate_cake", 370, 5, 50, 18],
  ["chocolate_mousse", 250, 5, 26, 15],
  ["churros", 380, 5, 43, 21],
  ["clam_chowder", 95, 4, 11, 4],
  ["club_sandwich", 235, 13, 20, 12],
  ["crab_cakes", 210, 14, 10, 13],
  ["creme_brulee", 340, 5, 25, 25],
  ["croque_madame", 260, 13, 22, 14],
  ["cup_cakes", 390, 4, 53, 19],
  ["deviled_eggs", 205, 11, 2, 17],
  ["donuts", 420, 5, 49, 23],
  ["dumplings", 180, 8, 26, 5],
  ["edamame", 120, 11, 9, 5],
  ["eggs_benedict", 230, 11, 14, 15],
  ["escargots", 150, 17, 3, 9],
  ["falafel", 330, 13, 32, 18],
  ["filet_mignon", 220, 27, 0, 12],
  ["fish_and_chips", 235, 12, 22, 11],
  ["foie_gras", 410, 11, 3, 40],
  ["french_fries", 312, 3, 41, 15],
  ["french_onion_soup", 85, 3, 9, 4],
  ["french_toast", 230, 7, 28, 10],
  ["fried_calamari", 225, 15, 15, 11],
  ["fried_rice", 170, 5, 26, 5],
  ["frozen_yogurt", 135, 4, 26, 2],
  ["garlic_bread", 350, 9, 41, 17],
  ["gnocchi", 170, 4, 35, 2],
  ["greek_salad", 115, 4, 6, 9],
  ["grilled_cheese_sandwich", 330, 12, 30, 18],
  ["grilled_salmon", 205, 22, 0, 12],
  ["guacamole", 155, 2, 9, 14],
  ["gyoza", 205, 9, 27, 7],
  ["hamburger", 260, 13, 25, 12],
  ["hot_and_sour_soup", 55, 3, 5, 2],
  ["hot_dog", 290, 10, 21, 18],
  ["huevos_rancheros", 170, 9, 15, 8],
  ["hummus", 170, 7, 14, 9],
  ["ice_cream", 205, 4, 24, 11],
  ["lasagna", 165, 9, 15, 8],
  ["lobster_bisque", 105, 5, 8, 6],
  ["lobster_roll_sandwich", 240, 13, 24, 10],
  ["macaroni_and_cheese", 200, 8, 23, 9],
  ["macarons", 410, 8, 48, 22],
  ["miso_soup", 40, 3, 4, 1],
  ["mussels", 170, 24, 7, 5],
  ["nachos", 285, 10, 28, 15],
  ["omelette", 155, 11, 2, 12],
  ["onion_rings", 400, 4, 42, 24],
  ["oysters", 80, 9, 5, 2],
  ["pad_thai", 185, 7, 24, 7],
  ["paella", 160, 8, 23, 4],
  ["pancakes", 225, 6, 29, 9],
  ["panna_cotta", 240, 4, 22, 15],
  ["peking_duck", 280, 18, 5, 21],
  ["pho", 75, 5, 10, 2],
  ["pizza", 266, 11, 33, 10],
  ["pork_chop", 230, 26, 0, 13],
  ["poutine", 250, 7, 29, 12],
  ["prime_rib", 290, 23, 0, 22],
  ["pulled_pork_sandwich", 260, 15, 24, 12],
  ["ramen", 110, 5, 14, 4],
  ["ravioli", 190, 8, 25, 6],
  ["red_velvet_cake", 390, 4, 50, 20],
  ["risotto", 170, 5, 26, 5],
  ["samosa", 300, 6, 34, 16],
  ["sashimi", 135, 22, 1, 5],
  ["scallops", 110, 20, 3, 1],
  ["seaweed_salad", 110, 2, 14, 5],
  ["shrimp_and_grits", 160, 10, 16, 6],
  ["spaghetti_bolognese", 170, 8, 20, 6],
  ["spaghetti_carbonara", 225, 10, 24, 10],
  ["spring_rolls", 185, 5, 23, 8],
  ["steak", 250, 26, 0, 17],
  ["strawberry_shortcake", 265, 4, 34, 13],
  ["sushi", 150, 5, 28, 2],
  ["tacos", 225, 11, 20, 11],
  ["takoyaki", 220, 7, 28, 9],
  ["tiramisu", 285, 5, 29, 17],
  ["tuna_tartare", 150, 22, 3, 6],
  ["waffles", 290, 7, 34, 14],
];

const commonFoods: [string, number, number, number, number][] = [
  ["Banana", 89, 1, 23, 0], ["Apple", 52, 0, 14, 0], ["Orange", 47, 1, 12, 0], ["Grapes", 69, 1, 18, 0], ["Watermelon", 30, 1, 8, 0], ["Pineapple", 50, 1, 13, 0], ["Mango", 60, 1, 15, 0], ["Peach", 39, 1, 10, 0], ["Pear", 57, 0, 15, 0], ["Kiwi", 61, 1, 15, 0], ["Lemon", 29, 1, 9, 0], ["Lime", 30, 1, 11, 0], ["Cherry", 63, 1, 16, 0], ["Papaya", 43, 0, 11, 0], ["Pomegranate", 83, 2, 19, 1], ["Cantaloupe", 34, 1, 8, 0], ["Honeydew", 36, 1, 9, 0], ["Raspberries", 52, 1, 12, 1], ["Blackberries", 43, 1, 10, 0],
  ["Egg", 155, 13, 1, 11], ["Oatmeal, cooked", 71, 3, 12, 2],
  ["Greek yogurt, plain", 73, 10, 4, 2], ["Chicken breast, cooked", 165, 31, 0, 4],
  ["Brown rice, cooked", 112, 3, 23, 1], ["White rice, cooked", 130, 3, 28, 0],
  ["Avocado", 160, 2, 9, 15], ["Peanut butter", 588, 25, 20, 50],
  ["Strawberries", 32, 1, 8, 0], ["Blueberries", 57, 1, 15, 0],
  ["Whole wheat bread", 247, 13, 41, 4], ["Sweet potato, baked", 90, 2, 21, 0],
  ["Broccoli, cooked", 35, 2, 7, 0], ["Tofu, firm", 144, 17, 3, 9],
  ["Almonds", 579, 21, 22, 50], ["Milk, 2%", 50, 3, 5, 2],
  ["Coffee, black", 2, 0, 0, 0], ["Salad greens", 20, 2, 3, 0],
];

export const FOOD_CATALOG: CatalogFood[] = [
  ...food101Rows.map(([id, calories, protein, carbs, fat]) => ({
    id, name: id.split("_").map((word) => word.charAt(0).toUpperCase() + word.slice(1)).join(" "),
    calories, protein, carbs, fat,
  })),
  ...commonFoods.map(([name, calories, protein, carbs, fat]) => ({
    id: name.toLowerCase().replace(/[^a-z0-9]+/g, "_"), name, calories, protein, carbs, fat,
  })),
];

export function findFoodByLabel(label: string): CatalogFood | undefined {
  const id = label.toLowerCase().trim().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
  const aliases: Record<string,string> = {
    granny_smith: "apple",
    banana: "banana",
    orange: "orange",
    pineapple: "pineapple",
    strawberry: "strawberries",
    raspberry: "raspberries",
    blackberry: "blackberries",
    grapes: "grapes",
    watermelon: "watermelon",
    mango: "mango",
    peach: "peach",
    pear: "pear",
    kiwi: "kiwi",
    lemon: "lemon",
    lime: "lime",
    cherry: "cherry",
    papaya: "papaya",
    pomegranate: "pomegranate",
    cantaloupe: "cantaloupe",
    honeydew: "honeydew",
  };
  return FOOD_CATALOG.find((item) => item.id === (aliases[id] || id));
}

export function searchFoods(query: string): CatalogFood[] {
  const term = query.toLowerCase().trim();
  if (!term) return FOOD_CATALOG.filter((item) => ["egg", "banana", "chicken_breast_cooked", "greek_yogurt_plain", "pizza", "oatmeal_cooked"].includes(item.id));
  return FOOD_CATALOG.filter((item) => item.name.toLowerCase().includes(term)).slice(0, 25);
}
