// app/api/generate-pdf/route.ts
import { NextRequest, NextResponse } from "next/server";
import puppeteer from "puppeteer";

export async function POST(req: NextRequest) {
    let browser;
    try {
        const { startDate, endDate, selectedDevices } = await req.json();

        browser = await puppeteer.launch({
            headless: true,
            args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-gpu"],
        });

        const page = await browser.newPage();

        await page.setViewport({
            width: 816,
            height: 1056,
            deviceScaleFactor: 1,
        });

        // Since your ProductionReport is directly in components,
        // we'll point to the root page that renders it
        const url = new URL(`${process.env.NEXT_PUBLIC_BASE_URL}`);
        url.searchParams.set("startDate", startDate);
        url.searchParams.set("endDate", endDate);
        if (selectedDevices.length > 0) {
            url.searchParams.set("devices", selectedDevices.join(","));
        }

        await page.goto(url.toString(), {
            waitUntil: "networkidle0",
            timeout: 60000,
        });

        // Wait for content to be rendered
        await page.evaluate(() => {
            return new Promise((resolve) => {
					setTimeout(resolve, 3000);
                // First check if content is already there
                const tables = document.querySelectorAll("table");
                const rows = document.querySelectorAll("tbody tr");
                if (tables.length > 0 && rows.length > 0) {
                    resolve(true);
                    return;
                }

                // If not, wait a short while and check again
                setTimeout(() => {
                    resolve(true);
                }, 1000);
            });
        });

        const pdf = await page.pdf({
            format: "Letter",
            printBackground: true,
            margin: {
                top: "0.5in",
                right: "0.5in",
                bottom: "0.5in",
                left: "0.5in",
            },
        });

        await browser.close();
        browser = null;

        return new NextResponse(pdf, {
            headers: {
                "Content-Type": "application/pdf",
                "Content-Disposition": `attachment; filename="production-report-${startDate}-to-${endDate}.pdf"`,
            },
        });
    } catch (error: unknown) {
        // Properly type the error
        const errorMessage =
            error instanceof Error ? error.message : "Unknown error";
        console.error("PDF generation error:", errorMessage);

        // Clean up browser if it's still open
        if (browser) {
            await browser.close();
        }

        return NextResponse.json(
            { error: "Failed to generate PDF", details: errorMessage },
            { status: 500 }
        );
    }
}
