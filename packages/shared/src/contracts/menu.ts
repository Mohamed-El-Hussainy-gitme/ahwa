import type { DeliveryMode, StationType } from "../domain/contract-v2.js";

export interface ListCategoriesRequest {
  readonly branchId?: string;
  readonly includeInactive?: boolean;
}

export interface CreateCategoryRequest {
  readonly branchId?: string;
  readonly displayName: string;
  readonly displayOrder?: number;
}

export interface UpdateCategoryRequest {
  readonly categoryId: string;
  readonly displayName?: string;
  readonly displayOrder?: number;
  readonly isActive?: boolean;
}

export interface ListProductsRequest {
  readonly branchId?: string;
  readonly categoryId?: string;
  readonly includeInactive?: boolean;
}

export interface CreateProductRequest {
  readonly categoryId: string;
  readonly sku?: string;
  readonly displayName: string;
  readonly description?: string;
  readonly stationType: StationType;
  readonly deliveryMode?: DeliveryMode;
  readonly unitLabel?: string;
  readonly basePrice: number;
  readonly taxRate?: number;
  readonly allowsDeferred?: boolean;
  readonly displayOrder?: number;
}

export interface UpdateProductRequest {
  readonly productId: string;
  readonly categoryId?: string;
  readonly sku?: string;
  readonly displayName?: string;
  readonly description?: string;
  readonly stationType?: StationType;
  readonly deliveryMode?: DeliveryMode;
  readonly unitLabel?: string;
  readonly basePrice?: number;
  readonly taxRate?: number;
  readonly allowsDeferred?: boolean;
  readonly isActive?: boolean;
  readonly isAvailable?: boolean;
  readonly displayOrder?: number;
}
