/**
 * Minimal typings for the parts of SaxonJS 2 this project uses. SaxonJS ships without types.
 * The same API exists in the Node build (npm "saxon-js") and the browser build (SaxonJS2.rt.js).
 */
export type SaxonNode = object;

export type SaxonApi = {
  getResource(options: { text: string; type: "xml" }): Promise<SaxonNode>;
  transform(
    options: {
      stylesheetInternal: unknown;
      sourceNode: SaxonNode;
      destination: "document";
    },
    mode: "async",
  ): Promise<{ principalResult: SaxonNode }>;
  XPath: {
    evaluate(
      expression: string,
      context: SaxonNode | null,
      options?: { namespaceContext?: Record<string, string>; resultForm?: "array" | "iterator" | "default" },
    ): unknown;
  };
  getProcessorInfo(): { productVersion: string; productName: string };
};
