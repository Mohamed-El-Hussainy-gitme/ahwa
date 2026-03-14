export interface StaffListRequest {
  readonly branchId?: string;
  readonly includeInactive?: boolean;
}

export interface CreateEmployeeRequest {
  readonly branchId?: string;
  readonly fullName: string;
  readonly phone?: string;
  readonly employeeCode: string;
  readonly pin: string;
}

export interface UpdateEmployeeRequest {
  readonly userId: string;
  readonly branchId?: string;
  readonly fullName?: string;
  readonly phone?: string;
  readonly employeeCode?: string;
  readonly isActive?: boolean;
}

export interface ResetEmployeePinRequest {
  readonly userId: string;
  readonly pin: string;
}
