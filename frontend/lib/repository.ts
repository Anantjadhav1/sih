/**
 * Knowledge Repository catalogue.
 *
 * Deliberately static: the repository tab is a shell for the demo. In
 * production these rows come from the ResearchDocuments table, with the
 * abstract text chunked into pgvector for the Co-Pilot's retrieval step.
 */
export type EntryType =
  | "Research Paper"
  | "Dataset"
  | "Policy Document"
  | "Case Study";

export interface RepositoryEntry {
  id: string;
  title: string;
  type: EntryType;
  org: string;
  authors: string;
  date: string;
  /** ISO date, used for sorting */
  published: string;
  description: string;
  tags: string[];
}

export const ENTRY_TYPES: EntryType[] = [
  "Research Paper",
  "Dataset",
  "Policy Document",
  "Case Study",
];

export const REPOSITORY: RepositoryEntry[] = [
  {
    id: "cvm-coastal",
    title: "Climate Vulnerability Mapping in Maharashtra Coastal Districts",
    type: "Research Paper",
    org: "Indian Institute of Tropical Meteorology",
    authors: "R. Deshmukh, A. Iyer, S. Kulkarni",
    date: "Mar 2025",
    published: "2025-03-14",
    description:
      "Composite vulnerability index across 7 coastal districts, combining CMIP6 downscaled precipitation with Census settlement density.",
    tags: ["climate", "vulnerability", "coastal"],
  },
  {
    id: "dispute-niti",
    title: "Land Dispute Resolution Patterns - NITI Aayog Dataset",
    type: "Dataset",
    org: "NITI Aayog",
    authors: "Land Records Modernisation Cell",
    date: "Jan 2025",
    published: "2025-01-22",
    description:
      "Disposal times and outcome categories for 1.2M civil land disputes across 21 states, 2015-2024, with district-level joins.",
    tags: ["disputes", "records", "judiciary"],
  },
  {
    id: "sprawl-pmr",
    title: "Urban Sprawl Impact Study - Pune Metropolitan Region",
    type: "Case Study",
    org: "Savitribai Phule Pune University",
    authors: "M. Joshi, P. Rane",
    date: "Nov 2024",
    published: "2024-11-08",
    description:
      "Twenty-year LULC change detection across the PMR, quantifying farmland absorbed by the Hinjewadi-Wakad corridor.",
    tags: ["sprawl", "LULC", "pune"],
  },
  {
    id: "dolr-conversion",
    title: "Model Guidelines for Agricultural Land Conversion",
    type: "Policy Document",
    org: "Department of Land Resources, Ministry of Rural Development",
    authors: "DoLR Policy Division",
    date: "Aug 2024",
    published: "2024-08-30",
    description:
      "Central advisory on state conversion procedures, including environmental clearance thresholds and compensation floors.",
    tags: ["policy", "conversion", "central"],
  },
  {
    id: "bhuvan-lulc",
    title: "Bhuvan LULC 50K Time Series - Maharashtra Tiles",
    type: "Dataset",
    org: "ISRO / National Remote Sensing Centre",
    authors: "NRSC Land Use Division",
    date: "Jun 2024",
    published: "2024-06-11",
    description:
      "Decadal 1:50,000 land use / land cover classification rasters with WMS and WFS endpoints for programmatic access.",
    tags: ["remote-sensing", "LULC", "bhuvan"],
  },
  {
    id: "floodplain-encroach",
    title: "Floodplain Encroachment and Municipal Liability",
    type: "Research Paper",
    org: "Centre for Policy Research",
    authors: "N. Bhattacharya, K. Menon",
    date: "Apr 2024",
    published: "2024-04-19",
    description:
      "Statistical link between permitted construction inside CWC flood lines and post-monsoon damage claims in 12 Indian cities.",
    tags: ["flood", "liability", "urban"],
  },
  {
    id: "tenancy-reform",
    title: "Tenancy Reform Outcomes in Vidarbha - A Longitudinal Review",
    type: "Case Study",
    org: "Gokhale Institute of Politics and Economics",
    authors: "S. Pawar, D. Nair",
    date: "Feb 2024",
    published: "2024-02-05",
    description:
      "Household panel tracking tenure security and credit access for 4,200 tenant cultivators over three cropping cycles.",
    tags: ["tenancy", "vidarbha", "livelihoods"],
  },
  {
    id: "svamitva-eval",
    title: "SVAMITVA Drone Survey - Property Card Issuance Audit",
    type: "Policy Document",
    org: "Ministry of Panchayati Raj",
    authors: "SVAMITVA Programme Management Unit",
    date: "Dec 2023",
    published: "2023-12-15",
    description:
      "Coverage and accuracy audit of drone-based abadi mapping, with reconciliation gaps flagged against legacy revenue records.",
    tags: ["svamitva", "survey", "titling"],
  },
];
