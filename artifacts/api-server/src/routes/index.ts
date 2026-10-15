import { Router, type IRouter } from "express";
import authRouter from "./auth";
import calendarRouter from "./calendar";
import dashboardRouter from "./dashboard";
import healthRouter from "./health";
import importsRouter from "./imports";

const router: IRouter = Router();

router.use(healthRouter);
router.use(authRouter);
router.use(calendarRouter);
router.use(dashboardRouter);
router.use(importsRouter);

export default router;
