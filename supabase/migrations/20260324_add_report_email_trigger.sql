CREATE OR REPLACE FUNCTION public.send_report_email()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  edge_function_url TEXT;
BEGIN
  edge_function_url := 'https://qtihezzbuubnyvrjdkjd.supabase.co/functions/v1/send-report-email';

  PERFORM net.http_post(
    url := edge_function_url,
    body := jsonb_build_object('reportId', NEW.id),
    headers := jsonb_build_object('Content-Type', 'application/json')
  );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trigger_send_report_email ON public.reports;

CREATE TRIGGER trigger_send_report_email
AFTER INSERT ON public.reports
FOR EACH ROW
EXECUTE FUNCTION public.send_report_email();
