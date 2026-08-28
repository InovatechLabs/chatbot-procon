import type { Request, Response } from 'express';
export declare const getNodes: (req: Request, res: Response) => Promise<Response<any, Record<string, any>>>;
export declare const createNode: (req: Request, res: Response) => Promise<Response<any, Record<string, any>>>;
export declare const updateNode: (req: Request, res: Response) => Promise<Response<any, Record<string, any>>>;
export declare const deleteNode: (req: Request, res: Response) => Promise<Response<any, Record<string, any>>>;
export declare const createOption: (req: Request, res: Response) => Promise<Response<any, Record<string, any>>>;
export declare const updateOption: (req: Request, res: Response) => Promise<Response<any, Record<string, any>>>;
export declare const deleteOption: (req: Request, res: Response) => Promise<Response<any, Record<string, any>>>;
//# sourceMappingURL=nodesController.d.ts.map