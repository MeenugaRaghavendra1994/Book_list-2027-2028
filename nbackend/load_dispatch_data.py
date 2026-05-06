import requests
import pandas as pd
import psycopg2
import logging
import time
import json
from io import BytesIO
from datetime import datetime
from concurrent.futures import ThreadPoolExecutor, as_completed

# ================================
# 🔧 LOGGING
# ================================
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(levelname)s - %(message)s"
)

# ================================
# 🧹 HELPERS
# ================================
import pandas as pd
from datetime import datetime

# ---------------------------
# TEXT / ID CLEANER
# ---------------------------
def clean(value):
    # Handle nulls
    if value is None or pd.isna(value):
        return None

    # Handle strings
    if isinstance(value, str):
        v = value.strip()
        if v == "" or v.lower() in {"none", "null", "nan"}:
            return None

        # Fix "2009759477.0"
        if v.endswith(".0"):
            try:
                return str(int(float(v)))
            except:
                return v

        return v

    # Handle floats (main fix)
    if isinstance(value, float):
        if value.is_integer():
            return str(int(value))   # remove .0
        return str(value)

    # Handle integers
    if isinstance(value, int):
        return str(value)

    # Fallback
    return str(value)


# ---------------------------
# INTEGER CLEANER
# ---------------------------
def to_int(value):
    try:
        if value is None or pd.isna(value):
            return None
        return int(float(value))
    except:
        return None


# ---------------------------
# DATETIME CLEANER (VERY IMPORTANT)
# ---------------------------
def clean_datetime(value):
    if value is None or pd.isna(value):
        return None

    try:
        # Auto-detect format (no warning)
        parsed = pd.to_datetime(value, errors='coerce')

        if pd.isna(parsed):
            return None

        # Optional safety check
        if parsed.year < 1900 or parsed.year > 2100:
            return None

        return parsed.to_pydatetime()

    except:
        return None
# ================================
# 🔐 CONFIG
# ================================
REFRESH_TOKEN = "eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.eyJ0b2tlbl90eXBlIjoicmVmcmVzaCIsImV4cCI6MTc5MjgxOTM4NCwianRpIjoiYWZlYzE0YmQ2MDk5NDIxMmI3OTg0NmMzNjhiNjk0MTEiLCJ1c2VyX2lkIjo2NDUxNjMsImVtYWlsIjoibWVlbnVnYS5yYWdoYXZlbmRyYUBvcmNoaWRzaW50bC5lZHUuaW4iLCJmaXJzdF9uYW1lIjoiTUVFTlVHQSBSQUdIQVZFTkRSQSIsImxhc3RfbmFtZSI6IiIsImlzX2FjdGl2ZSI6dHJ1ZSwiaXNfc3VwZXJ1c2VyIjpmYWxzZSwidXNlcm5hbWUiOiIyMDI0MDAwMTE3OF9PSVMiLCJ1c2VyX2xldmVsIjozMywiYWNjZXNzX2xldmVsIjoiem9uZSIsInZlciI6MTB9.9_lvSVFhxyyPy5uX2ov0PDh7yuc3lnnRzjWYgEqgOSQ"

DB_CONFIG = {
    "host": "localhost",
    "port": 5432,
    "database": "Dispatch_Tracker",
    "user": "postgres",
    "password": "Raghu"
}
#BRANCHES = [3,4,5,6,7,8,10,11,12,13,14,15,17,18,19,20,21,24,26,27,30,41,57,66,67,69,70,72,73,76,77,81,82,94,101,123,124,194,205,209,210,213,239,240,241,242,244,245,246,248,249,250,251,252,253,254,257,258,264,265,266,267,268,269,270,271,272,273,274,275,276,277,280,281,282,283,285,286,287,288,289,290,291,292,293,296,297,298,299,300,301,305,338,353,354,355,356,357,358,359,360,361,362,363,364,365,366,367,369,370,371,423,425,426,427,428,429,430,432,433,434,435,436,437,438,442,443,444,445,446,447,449,450,451]
BRANCHES = [245]  # test first

# ================================
# 🔁 TOKEN
# ================================
def get_access_token():
    url = "https://orchids.letseduvate.com/qbox/erp_user/access-token/"
    res = requests.post(url, json={"refresh": REFRESH_TOKEN})
    return res.json().get("data")

# ================================
# 🚀 PROCESS SINGLE BRANCH (THREAD)
# ================================
def process_branch(branch, access_token):
    logging.info(f"🚀 Fetching branch {branch}")

    url = f"https://orchids.finance.letseduvate.com/qbox/ekart/branch-wise-dispatch-report/?finance_session_year=47&branch={branch}&is_branch_wise_report=true"

    try:
        res = requests.get(url, headers={"Authorization": f"Bearer {access_token}"}, timeout=60)
    except Exception as e:
        return {"failed_branch": (branch, str(e))}

    if res.status_code != 200:
        return {"failed_branch": (branch, res.text)}

    df = pd.read_excel(BytesIO(res.content))
    df = df.where(pd.notnull(df), None)
    df.columns = [c.strip().lower().replace(" ", "_") for c in df.columns]

    rows = []
    failed_rows = []

    for _, row in df.iterrows():
        try:
            rows.append((
                clean(row.get("zone_id")),
                clean(row.get("zone_name")),
                clean(row.get("branch_id")),
                clean(row.get("branch_name")),
                clean(row.get("grade_name")),
                clean(row.get("branch_pin_code")),
                clean(row.get("city")),
                clean(row.get("student_name")),
                clean(row.get("erp_id")),
                clean(row.get("ekart_order_no")),
                clean(row.get("ekart_tracking_no")),
                clean(row.get("ekart_order_created_at")),
                clean(row.get("transaction_no")),
                clean(row.get("payment_date")),
                clean(row.get("payment_month")),
                clean(row.get("item_sku")),
                clean(row.get("item_name")),
                to_int(row.get("quantity")),
                clean(row.get("docket_id")),
                clean(row.get("invoice_id")),
                clean(row.get("sub_category_name")),
                clean(row.get("volume")),
                clean(row.get("order_type")),
                clean(row.get("expected_delivery_date")),
                clean_datetime(row.get("shipped_datetime")),
                clean_datetime(row.get("delivery_datetime")),
                clean(row.get("current_status")),
                clean_datetime(row.get("recieved_by_parent_datetime")),
                clean(row.get("sales_order")),
                clean_datetime(row.get("packed_datetime")),
            ))
        except Exception as e:
            failed_rows.append((branch, str(e), json.dumps(row.to_dict(), default=str)))

    logging.info(f"✅ branch={branch} done; rows={len(rows)}; failed_rows={len(failed_rows)}")
    return {"rows": rows, "failed_rows": failed_rows}


# ================================
# 🏁 MAIN FUNCTION
# ================================
def load_data():

    access_token = get_access_token()

    conn = psycopg2.connect(**DB_CONFIG)
    cursor = conn.cursor()

    # 🔥 CLEAR TABLE FIRST (NO DUPLICATES)
    cursor.execute("TRUNCATE TABLE dispatch_tracker_2627")
    conn.commit()

    all_rows = []
    all_failed_rows = []
    all_failed_branches = []

    # ================================
    # ⚡ INSERT SQL TEMPLATE
    # ================================
    insert_sql = """
    INSERT INTO dispatch_tracker_2627 (
        zone_id, zone_name, branch_id, branch_name, grade_name,
        branch_pin_code, city, student_name, erp_id,
        ekart_order_no, ekart_tracking_no, ekart_order_created_at,
        transaction_no, payment_date, payment_month,
        item_sku, item_name, quantity,
        docket_id, invoice_id, sub_category_name,
        volume, order_type, expected_delivery_date,
        shipped_datetime, delivery_datetime, current_status, recieved_by_parent_datetime, sales_order,packed_datetime
    ) VALUES %s
    """

    from psycopg2.extras import execute_values

    # ================================
    # 🚀 THREADING (FAST)
    # ================================
    with ThreadPoolExecutor(max_workers=10) as executor:
        futures = [executor.submit(process_branch, b, access_token) for b in BRANCHES]

        for future in as_completed(futures):
            result = future.result()

            if "rows" in result and result["rows"]:
                execute_values(cursor, insert_sql, result["rows"])
                conn.commit()
                all_rows.extend(result["rows"])
                logging.info(f"📥 inserted_branch_rows={len(result['rows'])}")

            if "failed_rows" in result and result["failed_rows"]:
                execute_values(cursor,
                    "INSERT INTO dispatch_failed_rows (branch, error, data) VALUES %s",
                    result["failed_rows"]
                )
                conn.commit()
                all_failed_rows.extend(result["failed_rows"])

            if "failed_branch" in result:
                all_failed_branches.append(result["failed_branch"])

    logging.info(f"📊 Total rows inserted: {len(all_rows)}")
    # ================================
    # 🔄 RETRY FAILED BRANCHES (UP TO 5 TIMES)
    # ================================
    final_failed_branches = []
    if all_failed_branches:
        for branch, error in all_failed_branches:
            success = False
            for attempt in range(5):
                logging.info(f"🔄 Retrying branch {branch}, attempt {attempt+1}")
                result = process_branch(branch, access_token)
                if "failed_branch" not in result:
                    # Success
                    if "rows" in result and result["rows"]:
                        execute_values(cursor, insert_sql, result["rows"])
                        conn.commit()
                        all_rows.extend(result["rows"])
                        logging.info(f"📥 inserted_retry_branch_rows={len(result['rows'])}")
                    if "failed_rows" in result and result["failed_rows"]:
                        execute_values(cursor,
                            "INSERT INTO dispatch_failed_rows (branch, error, data) VALUES %s",
                            result["failed_rows"]
                        )
                        conn.commit()
                        all_failed_rows.extend(result["failed_rows"])
                    success = True
                    break
                else:
                    logging.warning(f"Retry {attempt+1} failed for branch {branch}: {result['failed_branch'][1]}")
                    time.sleep(1)  # Small delay between retries
            if not success:
                final_failed_branches.append((branch, error))
    # ================================
    # ✅ FINAL FAILED BRANCHES
    # ================================
    if final_failed_branches:
        execute_values(cursor,
            "INSERT INTO dispatch_failed_branches (branch, response) VALUES %s",
            final_failed_branches
        )
        conn.commit()

    # Already inserted per-branch failed_rows above.

    # ================================
    # 📊 AGGREGATE INTO ORDER_TABLE
    # ================================
    logging.info("📊 Aggregating data into order_table")
    cursor.execute("""
        INSERT INTO public.order_table (branch_name, grade_name, item_sku, item_name, quantity)
        SELECT branch_name, grade_name, item_sku, item_name, SUM(quantity) as quantity
        FROM dispatch_tracker_2627
        WHERE quantity IS NOT NULL
        GROUP BY branch_name, grade_name, item_sku, item_name
        ON CONFLICT (branch_name, grade_name, item_sku, item_name) DO UPDATE SET
        quantity = EXCLUDED.quantity
    """)
    conn.commit()
    logging.info("✅ Aggregated data inserted into order_table")

    cursor.close()
    conn.close()

    logging.info("🎯 DONE FAST LOAD")

# ================================
# ▶️ RUN
# ================================
if __name__ == "__main__":
    load_data()