"use client";

import { Button                                   } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { productionData                           } from "@/lib/data";
import { parseDateString, tryParseDateString      } from "@/lib/utils";
import { endOfDay, format, isValid, startOfDay    } from "date-fns";
import { Download, Printer                        } from "lucide-react";
import { useSearchParams                          } from "next/navigation";
import { Suspense, useEffect, useMemo, useState   } from "react";
import { Bar,
			CartesianGrid,
			ComposedChart,
			Legend,
			Line,
			Tooltip,
			XAxis,
			YAxis, } from "recharts";

/* `getDeviceChartData()`, an inner function used further below, is duplicated
and exported here for utility testing purposes. */
export const getDeviceChartData = (
	summary: Record < 
		string,
		{ good: number; reject: number; duration: number }
	>
) => {
	return Object.entries(summary).map(([state, data]) => ({
		state,
		good: Math.round(data.good),
		reject: Math.round(data.reject),
		duration: Number((data.duration / 3600).toFixed(2))
	}));
};

/* The inclusion of this function wraps the entire ProductionReport module in a
<Suspense/>, which is necessary for the Node build to finish successfully. */
export function Layout() {
	return (
		< Suspense fallback = { <div> Loading... </div> } >
			< ProductionReport />
		</Suspense>
	);
}

export function ProductionReport() {
   const searchParams = useSearchParams();
   const [selectedDevices, setSelectedDevices] = useState<string[]>([]);

	/* Critical fix: Do NOT call the `Date()` function here; leave that for the
	utility function `parseDate()` later. Doing so here will result in a slight
	discrepancy in ISO format, potentially breaking the application on WebKit
	(Safari). */

   const [startDate, setStartDate] = useState (
      startOfDay(parseDateString("10-27-2024"))
   );
   const [endDate, setEndDate] = useState (
		endOfDay(parseDateString("10-29-2024"))
	);

   const [isGenerating, setIsGenerating] = useState(false);
   const [isLoaded, setIsLoaded] = useState(false);
   useEffect(() => {
      const devicesParam = searchParams.get("devices");
      const startParam   = searchParams.get("startDate");
      const endParam     = searchParams.get("endDate");
      if (devicesParam) {
         setSelectedDevices(devicesParam.split(","));
      }
      if (startParam) {
         const parsedDate = tryParseDateString(startParam);
         if (parsedDate) {
            setStartDate(startOfDay(parsedDate));
         }
      }
      if (endParam) {
         console.log("endParam", endParam);
         const parsedDate = tryParseDateString(endParam);
         if (parsedDate) {
            setEndDate(endOfDay(parsedDate));
         }
      }
      setIsLoaded(true);
   }, [searchParams]);
   const devices = useMemo (
      () => [...new Set(productionData.map((item) => item.deviceKey))],
      []
   );
   const reports = useMemo(() => {
      if (!isLoaded) {
			return [];
		}
      return devices.filter((device) =>
         selectedDevices.length === 0 || selectedDevices.includes(device)
      ).map((device) => {
         const deviceData = productionData.filter((item) => {
            const itemStartTime = parseDateString(item.start_time);
            const itemEndTime = parseDateString(item.end_time);
            return (
               item.deviceKey === device &&
               isValid(itemStartTime) &&
               isValid(itemEndTime) &&
               itemStartTime >= startDate &&
               itemEndTime <= endDate
            );
         });
         const summary = deviceData.reduce((acc, curr) => {
            const state = curr.process_state_display_name;
            if (!acc[state]) {
               acc[state] = { good: 0, reject: 0, duration: 0 };
            }
            acc[state].good     += curr.good_count;
            acc[state].reject   += curr.reject_count;
            acc[state].duration += curr.duration;
            return acc;
         }, {} as Record<string, { good: number; reject: number; duration: number }>);
         return { device, summary };
      });
   }, [devices, selectedDevices, startDate, endDate, isLoaded]);
	if (!isLoaded) {
		return <div> Loading... </div>;
	}
   const handleDateChange = (date: string, isStart: boolean) => {
      console.log("date", date);
      const parsedDate = parseDateString(date);
      if (parsedDate) {
         if (isStart) {
            setStartDate(startOfDay(parsedDate));
         } else {
            setEndDate(endOfDay(parsedDate));
         }
      }
   };
	const getDeviceChartData = (
		summary: Record < 
			string,
			{ good: number; reject: number; duration: number }
		>
	) => {
		return Object.entries(summary).map(([state, data]) => ({
			state,
			good: Math.round(data.good),
			reject: Math.round(data.reject),
			duration: Number((data.duration / 3600).toFixed(2))
		}));
	};
   const handleDownloadPDF = async () => {
      try {
         setIsGenerating(true);
         const response = await fetch("/api/generate-pdf", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify ({
               startDate: format(startDate, "yyyy-MM-dd"),
               endDate: format(endDate, "yyyy-MM-dd"),
               selectedDevices
            })
         });
      	if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.details || "Failed to generate PDF");
         }
      	const blob = await response.blob();
         const url = window.URL.createObjectURL(blob);
         const link = document.createElement("a");
         link.href = url;
         link.download = `production-report-${format(
            startDate,
            "yyyy-MM-dd"
         )}-to-${format(
				endDate,
				"yyyy-MM-dd"
			)}.pdf`;
         document.body.appendChild(link);
         link.click();
         document.body.removeChild(link);
         window.URL.revokeObjectURL(url);
      } catch (error: unknown) {
         const errorMessage = error instanceof Error ? error.message : "Unknown error";
         console.error("Error downloading PDF:", error);
         alert(`Failed to generate PDF: ${errorMessage}`);
      } finally {
         setIsGenerating(false);
      }
   };
   if (!isLoaded) {
      return <div> Loading... </div>;
   }
   return (
      <div className = "p-8 bg-white">
         <div className = "mb-8 print:hidden">
            <Card>
               <CardHeader>
                  <CardTitle> Report Filters </CardTitle>
               </CardHeader>
               <CardContent className = "space-y-4">
                  <div className = "grid grid-cols-2 gap-4">
                     <div>
                        <label className = "block text-sm font-medium mb-1">
                           Start Date
                        </label>
                        <input
                           type = "date"
                           value = {format(startDate, "yyyy-MM-dd")}
                           onChange = {(e) =>
                              handleDateChange(e.target.value, true)
                           }
                           className = "w-full px-3 py-2 border rounded-md"
                        />
                     </div>
                     <div>
                        <label className = "block text-sm font-medium mb-1">
                           End Date
                        </label>
                        <input
                           type = "date"
                           value = {format(endDate, "yyyy-MM-dd")}
                           onChange = {(e) =>
                              handleDateChange(e.target.value, false)
                           }
                           className = "w-full px-3 py-2 border rounded-md"
                        />
                     </div>
                  </div>
                  <div>
                     <label className = "block text-sm font-medium mb-2">
                        Devices
                     </label>
                     <div className = "flex flex-wrap gap-4">
                        {devices.map((device) => (
                           <label
                              key = { device }
                              className = "flex items-center"
                           >
										<input
											type = "checkbox"
											checked = { selectedDevices.includes (
												device
											)}
											onChange = {(e) => {
												if (e.target.checked) {
													setSelectedDevices ([
														...selectedDevices,
														device,
													]);
												} else {
													setSelectedDevices (
														selectedDevices.filter (
															(d) => d !== device
														)
													);
												}
											}}
											className = "mr-2"
										/>
										{ device }
                        	</label>
                        ))}
                     </div>
                  </div>
               </CardContent>
            </Card>
         </div>
         <div className = "print:p-0 print:m-0">
            { reports.map(({ device, summary }, index) => (
               <div
               	key = {device}
                  className = {`print:w-[8.5in] print:h-[11in] print:m-0 print:p-8 ${
                     index < reports.length - 1 ? "page-break-after-always" : ""
                  }`}
               >
               <Card className = "h-full shadow-none print:shadow-none">
                  <CardHeader className = "pb-4 border-b">
               		<CardTitle>
                        <div className = "flex justify-between items-center">
                           <span className = "text-xl font-bold">
                              {device} Production Report Change output dir to default
                           </span>
                           <span className = "text-sm text-muted-foreground">
                              {format(startDate, "MMM d, yyyy")} - {" "}
                              {format(endDate, "MMM d, yyyy")}
                           </span>
                        </div>
                     </CardTitle>
                  </CardHeader>
                  <CardContent className = "pt-6 flex flex-col gap-6">
                     <div>
                        <table className = "w-full border-collapse">
                        	<thead>
                              <tr className = "bg-muted/50">
											<th className = "border px-4 py-2 text-left font-medium">
												Process State
											</th>
											<th className = "border px-4 py-2 text-right font-medium">
												Good Count
											</th>
											<th className = "border px-4 py-2 text-right font-medium">
												Reject Count
											</th>
											<th className = "border px-4 py-2 text-right font-medium">
												Duration (hrs)
											</th>
                           	</tr>
                           </thead>
                         	<tbody>
                              {Object.entries(summary).map(([state, data]) => (
                                 <tr
                                    key = {state}
                                    className = "even:bg-muted/20 print:even:bg-gray-100"
                                 >
												<td className = "border px-4 py-2">
													{state}
												</td>
												<td className = "border px-4 py-2 text-right">
													{ Math.round(data.good).toLocaleString() }
												</td>
												<td className = "border px-4 py-2 text-right">
													{ Math.round(data.reject).toLocaleString()}
												</td>
												<td className = "border px-4 py-2 text-right">
													{ (data.duration / 3600).toFixed(2) }
												</td>
                              	</tr>
                              ))}
                           </tbody>
                        </table>
                     </div>
                     <div className = "mt-6">
                        <h3 className = "text-lg font-semibold mb-4">
                           Production Overview
                     	</h3>
                        <ComposedChart
                           width  = {800}
                           height = {400}
                           data   = {getDeviceChartData(summary)}
                           margin = {{
                              top    : 20,
                           	right  : 80,
                              bottom : 80,
                              left   : 80
                           }}
                        >
                        <CartesianGrid strokeDasharray = "3 3" />
                           <XAxis
                              dataKey    = "state"
                              angle      = {-45}
                              textAnchor = "end"
                              height     = {80}
                              interval   = {0}
                           />
                           <YAxis
                              yAxisId     = "left"
                           	orientation = "left"
                              label       = {{
                                 value    : "Count",
                                 angle    : -90,
                                 position : "insideLeft",
                                 style    : { textAnchor: "middle" }
                              }}
                           />
                           <YAxis
                              yAxisId     = "right"
                              orientation = "right"
                              label       = {{
                              	value    : "Duration (hours)",
                                 angle    : 90,
                                 position : "insideRight",
                                 style    : { textAnchor: "middle" }
                              }}
                           />
                           <Tooltip />
                           <Legend
                              verticalAlign = "top"
                           	height = {36}
                           />
                           <Bar
                              yAxisId = "left"
                              dataKey = "good"
                              fill    = "#4ade80"
                              name    = "Good Count"
                              stackId = "stack"
                           />
                           <Bar
                              yAxisId = "left"
                              dataKey = "reject"
                              fill    = "#f87171"
                              name    = "Reject Count"
                              stackId = "stack"
                           />
                           <Line
                              yAxisId     = "right"
                              type        = "monotone"
                              dataKey     = "duration"
                              stroke      = "#6366f1"
                              strokeWidth = {2}
                              name        = "Duration"
                              dot         = {{ fill: "#6366f1" }}
                           />
                        </ComposedChart>
                     </div>
                  </CardContent>
            	</Card>
         </div>
      ))}
		</div>
		<div className = "mt-8 space-x-4 print:hidden">
			<Button onClick = {() => window.print()} className = "space-x-2">
				<Printer className = "w-4 h-4" />
				<span> Print Report main change</span>
			</Button>
			<Button
				onClick = {handleDownloadPDF}
				disabled = {isGenerating}
				variant = "outline"
				className = "space-x-2"
			>
				<Download className = "w-4 h-4" />
				<span>
					{isGenerating ? "Generating..." : "Download PDF"}
				</span>
			</Button>
		</div>
   </div>
   );
}
