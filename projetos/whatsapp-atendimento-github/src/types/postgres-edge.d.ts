declare module "npm:postgres@3.4.7" {
  export interface Sql {
    <Row extends object = Record<string, unknown>>(
      strings: TemplateStringsArray,
      ...values: unknown[]
    ): Promise<Row[]>;
    begin<Result>(callback: (sql: Sql) => Promise<Result>): Promise<Result>;
    array(values: readonly unknown[], type?: string): unknown;
    json(value: unknown): unknown;
    end(options?: Record<string, unknown>): Promise<void>;
  }

  export default function postgres(url: string, options?: Record<string, unknown>): Sql;
}
