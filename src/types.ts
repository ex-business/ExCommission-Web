export type Schema = Record<string, any>;
export type Operation = {
  group: string;
  section: string;
  title: string;
  method: string;
  path: string;
  key: string;
  parameters?: any[];
  requestBody?: any;
  [key: string]: any;
};
