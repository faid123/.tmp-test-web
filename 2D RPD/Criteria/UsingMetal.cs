using UnityEngine;

[CreateAssetMenu(fileName = "Using Metal", menuName = "Criteria/Using Metal")]
public class UsingMetal : Criteria
{
	public override bool Assess(PlacementData placementData, out CriteriaFailureData failureData)
	{
		failureData = null;

		bool result = CheckIfCorrectMaterial(placementData.jawType, Jaw_Material.metal_jaw);

		if (!result)
			failureData = GenerateFailureData("Not using metal material.", actionUponFailure);

		return result;
	}

	protected bool CheckIfCorrectMaterial(Jaw_Type jawType, Jaw_Material material)
	{
		Jaw jaw;

		switch (jawType)
		{
			case Jaw_Type.upper_jaw:
				jaw = DLLIntegration.instance.jUpper;
				break;
			case Jaw_Type.lower_jaw:
				jaw = DLLIntegration.instance.jLower;
				break;
			default:
				Logger.LogError(TypeLogError.General, $"Unhandled jaw type of {jawType} received. Unable to check jaw material.");
				return false;
		}

		return jaw.jaw_material == (int)material;
	}
}
