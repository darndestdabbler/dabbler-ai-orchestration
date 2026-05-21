import { SessionSet } from "../types";
export interface ActionSupports {
    uat: boolean;
    e2e: boolean;
}
export interface RowAction {
    id: string;
    label: string;
    group: number;
    when: (set: SessionSet, supports: ActionSupports) => boolean;
}
export declare const ROW_ACTIONS: RowAction[];
export declare function applicableActions(set: SessionSet, supports: ActionSupports): RowAction[];
