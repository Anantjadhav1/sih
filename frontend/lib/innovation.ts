/**
 * Innovation Hub listings. Static for the demo - production reads these from an
 * opportunities table with an application workflow behind the CTA.
 */
export type OpportunityType = "Hackathon" | "Grant" | "Pilot Project";

export interface Opportunity {
  id: string;
  title: string;
  type: OpportunityType;
  org: string;
  deadline: string;
  /** ISO date, used to compute urgency */
  closes: string;
  prize: string;
  description: string;
}

export const OPPORTUNITIES: Opportunity[] = [
  {
    id: "dolr-hack-2026",
    title: "Land Records Digitization Hackathon 2026",
    type: "Hackathon",
    org: "Department of Land Resources",
    deadline: "30 Nov 2026",
    closes: "2026-11-30",
    prize: "₹15 lakh pool",
    description:
      "Build tooling that reconciles legacy revenue records against SVAMITVA drone survey outputs at scale.",
  },
  {
    id: "mord-zoning-grant",
    title: "Climate-Resilient Zoning Innovation Grant",
    type: "Grant",
    org: "Ministry of Rural Development",
    deadline: "15 Jan 2027",
    closes: "2027-01-15",
    prize: "Up to ₹40 lakh",
    description:
      "Funding for decision-support tools that embed flood and heat projections directly into municipal zoning workflows.",
  },
  {
    id: "rult-pilot",
    title: "Rural-Urban Land Transition Pilot Program",
    type: "Pilot Project",
    org: "NITI Aayog / State Planning Boards",
    deadline: "31 Oct 2026",
    closes: "2026-10-31",
    prize: "3 districts, 18 months",
    description:
      "Field deployment of participatory conversion-approval processes across three peri-urban districts.",
  },
  {
    id: "bhuvan-geo-challenge",
    title: "Bhuvan Geospatial Analytics Challenge",
    type: "Hackathon",
    org: "ISRO / National Remote Sensing Centre",
    deadline: "12 Dec 2026",
    closes: "2026-12-12",
    prize: "₹10 lakh + NRSC mentorship",
    description:
      "Derive actionable land-governance indicators from open Bhuvan LULC and climate vulnerability layers.",
  },
];
