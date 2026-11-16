import { http } from '../../http';

export interface PanelDevice {
  id: number; name: string; href: string | null; rawLink: string | null;
  tracked: boolean; online: boolean; clientType: string | null; icon: string | null; ipPort: string;
}
export interface PanelGroup { categoryId: number | null; name: string; description: string | null; devices: PanelDevice[] }
export interface Panel { total: number; groups: PanelGroup[] }

export interface Category { id: number; name: string; description: string | null; deviceCount: number }
export interface CategoryInput { name: string; description: string }

export interface OrderData {
  categories: { id: number; name: string }[];
  items: { categoryId: number | null; devices: { id: number; name: string }[] }[];
}
export interface OrderSave {
  categoryIds: number[];
  items: { categoryId: number | null; deviceIds: number[] }[];
}

export const accessApi = {
  panel: () => http.get<Panel>('/access/panel'),
  categories: () => http.get<Category[]>('/access/categories'),
  createCategory: (b: CategoryInput) => http.post<Category>('/access/categories', b),
  updateCategory: (id: number, b: CategoryInput) => http.put<Category>(`/access/categories/${id}`, b),
  deleteCategory: (id: number) => http.del<{ ok: boolean }>(`/access/categories/${id}`),
  order: () => http.get<OrderData>('/access/order'),
  saveOrder: (b: OrderSave) => http.put<{ ok: boolean }>('/access/order', b),
};
