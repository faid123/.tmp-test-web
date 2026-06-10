using System.Collections;
using System.Collections.Generic;
using UnityEngine;

public class EmbrasureUIElement : UI_TogglableComponentElement
{
    public int toothFDIID;

	protected override bool PerformChecks(RPDPlaceable rpdComponent, bool isOn)
	{
		return base.PerformChecks(rpdComponent, isOn) && CanPlaceEmbrasure();
	}

	bool CanPlaceEmbrasure()
	{
		Utils.SplitMajorMinorIndices(toothFDIID, out int majorIndex, out int minorIndex);

		if (majorIndex == 10 || majorIndex == 20)
		{
			if (!DLLIntegration.instance.upperJawPresent)
				return false;
		}
		else
		{
			if (!DLLIntegration.instance.lowerJawPresent)
				return false;
		}


		if (minorIndex < 5)
			return false;

		int adjacentMesialToothFDIID = toothFDIID - 1;

		//check own tooth presence
		if (DLLIntegration.instance.GetToothByIndex(toothFDIID).presence != Tooth_Presence.present)
			return false;

		//check adjacent tooth presence
		if (DLLIntegration.instance.GetToothByIndex(adjacentMesialToothFDIID).presence != Tooth_Presence.present)
			return false;

		return true;
	}
}
