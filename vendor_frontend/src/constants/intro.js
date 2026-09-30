import { getLangText } from "lang/lang";

const img1 = "uploads/intro/business.png";
const img2 = "uploads/intro/business.png";
const img3 = "uploads/intro/price1.png";
const img4 = "uploads/intro/price2.png";
const img5 = "uploads/intro/price3.png";
const img6 = "uploads/intro/phone_os.PNG";
const img7 = "uploads/intro/edge.PNG";
const img8 = "uploads/intro/TV.PNG";
const img9 = "uploads/intro/signature1.PNG";
const img10 = "uploads/intro/1F.jpg";
const img11 = "uploads/intro/2F.jpg";
const img12 = "uploads/intro/3F.jpg";
const img13 = "uploads/intro/address1.PNG";
const img14 = "uploads/intro/address2.PNG";
const img15 = "uploads/intro/1F1.JPG";
const img16 = "uploads/intro/1F2.JPG";
const img17 = "uploads/intro/2F1.JPG";
const img18 = "uploads/intro/2F2.JPG";
const img19 = "uploads/intro/2F3.JPG";
const img20 = "uploads/intro/3F1.JPG";
const img21 = "uploads/intro/3F2.JPG";

/**
 * The product-range filter on the phone catalogue.
 *
 * A function because the "All" entry is a translated word - the range
 * names beside it are product names and stay as they are. `detailSubMenus`
 * used to sit here too, holding the four English tab labels for the
 * product detail page; those are catalogue keys now and live with the tabs
 * that render them.
 */
export const getProductRanges = () => [
  { id: 0, name: getLangText("TEXT_ALL"), category_pk: -1 },
  { id: 1, name: "S-9", category_pk: 13 },
  { id: 2, name: "S-7", category_pk: 15 },
  { id: 3, name: "S-5", category_pk: 17 },
];

export const COMPANY_BUSINESSES = [
  { id: 0, name: "Phone"},
  { id: 0, name: "IT"},
  { id: 0, name: "Eprod"},
  { id: 0, name: "Print"},
  { id: 0, name: "Commerce"},
]

export const MAIN_BUSINESS = [
  { name: "main1", img: img1 },
  { name: "main2", img: img2 },
  { name: "main3", img: img1 },
  { name: "main4", img: img2 },
]
export const TEN_SUPERS = [
  { name: "super1", img: img3 },
  { name: "super2", img: img4 },
  { name: "super3", img: img5 },
  { name: "super4", img: img3 },
]

export const INFO_TECH_LAB = [
  { name: "Phone", img: img6, description: "The quick brown fox jumps over the lazy dog." },
  { name: "Phone", img: img7, description: "The quick brown fox jumps over the lazy dog." },
  { name: "Phone", img: img8, description: "The quick brown fox jumps over the lazy dog." },
  { name: "Phone", img: img6, description: "The quick brown fox jumps over the lazy dog." },
  { name: "Phone", img: img7, description: "The quick brown fox jumps over the lazy dog." },
  { name: "Phone", img: img8, description: "The quick brown fox jumps over the lazy dog." },
]

export const SIGNATURES = [
  { img: img9 },
  { img: img9 },
  { img: img9 },
]

export const PROD_LINE = [
  { name: "Phone", img: img6, description: "The quick brown fox jumps over the lazy dog." },
  { name: "Phone", img: img7, description: "The quick brown fox jumps over the lazy dog." },
  { name: "Phone", img: img8, description: "The quick brown fox jumps over the lazy dog." },
]

export const MARS_SHOP = [
  { name: "F1", imgs: [{ img: img10 }, { img: img15 }, { img: img16 }]},
  { name: "F2", imgs: [{ img: img11 }, { img: img17 }, { img: img18 }, { img: img19 }]},
  { name: "F3", imgs: [{ img: img12 }, { img: img20 }, { img: img21 }]},
]

export const ADDRESS_MAPS = [
  { img: img13 },
  { img: img14 },
]