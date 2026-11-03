export class ArchiveEadParser {
  constructor(xmlString) {
    const parser = new DOMParser();
    this.doc = parser.parseFromString(xmlString, "application/xml");

    // Check for XML parse errors
    const parserError = this.doc.querySelector("parsererror");
    if (parserError) {
      throw new Error("Invalid XML document: " + parserError.textContent);
    }

    // Default namespace resolver for archival standards (EAD 2002 / EAD3 / XLINK)
    this.nsResolver = (prefix) => {
      const standardNamespaces = {
        xlink: "http://www.w3.org/1999/xlink",
        ead: "urn:isbn:1-931666-22-9",
        xsi: "http://www.w3.org/2001/XMLSchema-instance"
      };

      if (standardNamespaces[prefix]) {
        return standardNamespaces[prefix];
      }

      // Fallback to resolver created from the document root
      try {
        const docResolver = this.doc.createNSResolver(this.doc.documentElement);
        return docResolver.lookupNamespaceURI(prefix);
      } catch (e) {
        return null;
      }
    };
  }

  /**
   * Default presets tailored to AtoM EAD exports
   */
  static get DEFAULT_PRESETS() {
    return {
      inventory: {
        name: "Inventory List (Files & Items)",
        rowSelector: "//*[local-name()='c' or starts-with(local-name(), 'c0') or starts-with(local-name(), 'c1')]",
        columns: [
          { header: "Level", path: "@level" },
          { header: "Reference Code", path: "*[local-name()='did']/*[local-name()='unitid']" },
          { header: "Title", path: "*[local-name()='did']/*[local-name()='unittitle']" },
          { header: "Date", path: "*[local-name()='did']/*[local-name()='unitdate']" },
          { header: "Extents / PhysDesc", path: "*[local-name()='did']/*[local-name()='physdesc']" },
          { header: "Scope & Content", path: "*[local-name()='scopecontent']" },
          { header: "Parent Hierarchy", special: "breadcrumb" }
        ]
      },
      digital_objects: {
        name: "Digital Objects / Media Links",
        rowSelector: "//*[local-name()='dao']",
        columns: [
          { 
            header: "Parent Ref", 
            path: "ancestor::*[starts-with(local-name(), 'c') or local-name()='archdesc'][1]/*[local-name()='did']/*[local-name()='unitid']" 
          },
          { 
            header: "Parent Title", 
            path: "ancestor::*[starts-with(local-name(), 'c') or local-name()='archdesc'][1]/*[local-name()='did']/*[local-name()='unittitle']" 
          },
          { 
            header: "Link Title", 
            path: "@*[local-name()='title']" 
          },
          { 
            header: "URI / URL", 
            path: "@*[local-name()='href']" 
          }
        ]
      }
    };
  }

  /**
   * Evaluates XPath with the namespace resolver configured.
   */
  evaluateXPath(xpath, contextNode = this.doc) {
    const evaluator = new XPathEvaluator();
    const result = evaluator.evaluate(
      xpath,
      contextNode,
      this.nsResolver, // Passes the resolver instead of null
      XPathResult.ORDERED_NODE_SNAPSHOT_TYPE,
      null
    );

    const nodes = [];
    for (let i = 0; i < result.snapshotLength; i++) {
      nodes.push(result.snapshotItem(i));
    }
    return nodes;
  }

  /**
   * Sanitizes node text by stripping inner markup and normalizing whitespace.
   */
  cleanText(node) {
    if (!node) return "";
    const text = node.textContent || node.nodeValue || "";
    return text.replace(/\s+/g, " ").trim();
  }

  /**
   * Extracts table rows based on configured column definitions.
   */
  extractTable(rowSelector, columns) {
    const rowNodes = this.evaluateXPath(rowSelector);

    return rowNodes.map((rowNode) => {
      const rowData = {};

      columns.forEach((col) => {
        if (col.special === "breadcrumb") {
          rowData[col.header] = this.getBreadcrumb(rowNode);
        } else {
          const matchedNodes = this.evaluateXPath(col.path, rowNode);
          rowData[col.header] = matchedNodes
            .map((n) => this.cleanText(n))
            .filter(Boolean)
            .join("; ");
        }
      });

      return rowData;
    });
  }

  /**
   * Computes an inherited path (e.g. "Fonds > Series > Item")
   */
  getBreadcrumb(componentNode) {
    const ancestors = this.evaluateXPath(
      "ancestor::*[starts-with(local-name(), 'c') or local-name()='archdesc']",
      componentNode
    );
    return ancestors
      .map((anc) => {
        const titleNodes = this.evaluateXPath("*[local-name()='did']/*[local-name()='unittitle']", anc);
        return titleNodes.length > 0 ? this.cleanText(titleNodes[0]) : "";
      })
      .filter(Boolean)
      .join(" > ");
  }
}